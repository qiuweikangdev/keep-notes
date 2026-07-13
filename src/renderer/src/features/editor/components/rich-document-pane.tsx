import {
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";

import { useEditorStore } from "@/store/editor.store";
import {
  richDocumentSessionManager,
  richDocumentSurfaceRegistry,
  richPaneViewStateRegistry,
} from "../lib/editor-runtime";
import { normalizeRichDocumentPath } from "../lib/rich-document-surface-registry";
import type { RichDocumentBinding } from "../lib/rich-document-session-manager";
import type { RichPreviewAnchor } from "../lib/rich-preview-anchor";
import { toRichPaneKey, type RichPaneKey } from "../lib/rich-pane-view-state";
import {
  editorSplitPaintCoordinator,
  measureEditorOperation,
} from "../lib/editor-performance";
import type { RichBlockNoteRuntime } from "./blocknote-editor";
import { VirtualRichPreview } from "./virtual-rich-preview";

interface RichDocumentPaneProps {
  groupId: string;
  tabId: string;
  path: string;
}

interface PanePathRegistration {
  releaseHost: () => void;
  releaseVisible: () => void;
}

function attachRichPane(path: string, paneKey: RichPaneKey): boolean {
  const normalizedPath = normalizeRichDocumentPath(path);
  return richDocumentSessionManager.setActivePane(normalizedPath, paneKey);
}

function activateRichPane(
  path: string,
  binding: RichDocumentBinding,
  anchor: RichPreviewAnchor | null,
): boolean {
  if (import.meta.env.DEV) {
    return measureEditorOperation(
      "editor:pane-activate",
      () => {
        const normalizedPath = normalizeRichDocumentPath(path);
        const runtime = richDocumentSessionManager.getRuntime(
          normalizedPath,
        ) as RichBlockNoteRuntime | null;
        if (!runtime) return false;

        // 必须先同步移动唯一编辑器表面；移动失败的样本会被诊断层丢弃。
        if (
          !richDocumentSessionManager.setActivePane(
            normalizedPath,
            binding.paneKey,
          )
        ) {
          return false;
        }

        useEditorStore.getState().setActiveTab(binding.groupId, binding.tabId);
        runtime.focusAt(anchor);
        return true;
      },
      Boolean,
    );
  }

  const normalizedPath = normalizeRichDocumentPath(path);
  const runtime = richDocumentSessionManager.getRuntime(
    normalizedPath,
  ) as RichBlockNoteRuntime | null;
  if (!runtime) return false;
  if (
    !richDocumentSessionManager.setActivePane(normalizedPath, binding.paneKey)
  ) {
    return false;
  }
  useEditorStore.getState().setActiveTab(binding.groupId, binding.tabId);
  runtime.focusAt(anchor);
  return true;
}

function EditorSplitPaintCommit({ groupId }: { groupId: string }) {
  useLayoutEffect(
    () => editorSplitPaintCoordinator!.commitPane(groupId),
    [groupId],
  );
  return null;
}

export function RichDocumentPane({
  groupId,
  tabId,
  path,
}: RichDocumentPaneProps) {
  const normalizedPath = normalizeRichDocumentPath(path);
  const paneKey = toRichPaneKey(groupId, tabId);
  const hostRef = useRef<HTMLDivElement>(null);
  const registrationsRef = useRef(new Map<string, PanePathRegistration>());
  const lastReadyRuntimeRef = useRef<{
    path: string;
    runtime: RichBlockNoteRuntime;
  } | null>(null);
  const subscribeRuntime = useCallback(
    (listener: () => void) =>
      richDocumentSessionManager.subscribeRuntime(normalizedPath, listener),
    [normalizedPath],
  );
  const getRuntimeSnapshot = useCallback(
    () => richDocumentSessionManager.getRuntimeSnapshot(normalizedPath),
    [normalizedPath],
  );
  const runtime = useSyncExternalStore(
    subscribeRuntime,
    getRuntimeSnapshot,
    getRuntimeSnapshot,
  ) as RichBlockNoteRuntime | null;
  if (runtime) {
    lastReadyRuntimeRef.current = { path: normalizedPath, runtime };
  }
  const displayedRuntime = runtime ?? lastReadyRuntimeRef.current?.runtime;
  const displayedPath = runtime
    ? normalizedPath
    : (lastReadyRuntimeRef.current?.path ?? normalizedPath);
  const isLive = useEditorStore(
    (state) =>
      state.activeGroupId === groupId &&
      state.panelGroups.find((group) => group.id === groupId)?.activeTabId ===
        tabId,
  );

  const releaseRegistration = useCallback(
    (registeredPath: string, clearClosedPaneState: boolean) => {
      const registration = registrationsRef.current.get(registeredPath);
      if (!registration) return;

      richDocumentSessionManager.deactivateIfActive(registeredPath, paneKey);
      registration.releaseHost();
      registration.releaseVisible();
      registrationsRef.current.delete(registeredPath);
      if (!clearClosedPaneState) return;

      queueMicrotask(() => {
        const paneStillExists = useEditorStore
          .getState()
          .panelGroups.find((group) => group.id === groupId)
          ?.tabs.some((tab) => tab.id === tabId);
        if (!paneStillExists) richPaneViewStateRegistry.delete(paneKey);
      });
    },
    [groupId, paneKey, tabId],
  );

  useLayoutEffect(() => {
    return () => {
      for (const registeredPath of Array.from(
        registrationsRef.current.keys(),
      )) {
        releaseRegistration(registeredPath, true);
      }
    };
  }, [paneKey, releaseRegistration]);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host || registrationsRef.current.has(normalizedPath)) return;

    // 新文件先注册到同一宿主，但旧文件绑定保留到目标 runtime 就绪，避免切换期间出现 loading 闪烁。
    const releaseVisible = richDocumentSessionManager.retainVisible(
      normalizedPath,
      { paneKey, groupId, tabId },
    );
    const releaseHost = richDocumentSurfaceRegistry.registerHost(
      normalizedPath,
      paneKey,
      host,
    );
    registrationsRef.current.set(normalizedPath, {
      releaseHost,
      releaseVisible,
    });
  }, [groupId, normalizedPath, paneKey, tabId]);

  useLayoutEffect(() => {
    if (!runtime) {
      if (!isLive) {
        for (const registeredPath of registrationsRef.current.keys()) {
          richDocumentSessionManager.deactivateIfActive(
            registeredPath,
            paneKey,
          );
        }
      }
      return;
    }

    if (isLive && !attachRichPane(normalizedPath, paneKey)) return;
    if (!isLive) {
      richDocumentSessionManager.deactivateIfActive(normalizedPath, paneKey);
    }

    // 目标完整富文本已接管后再释放旧文档，切换对用户表现为一次原子替换。
    for (const registeredPath of Array.from(registrationsRef.current.keys())) {
      if (registeredPath !== normalizedPath) {
        releaseRegistration(registeredPath, false);
      }
    }
  }, [isLive, normalizedPath, paneKey, releaseRegistration, runtime]);

  const handleActivate = useCallback(
    (anchor: RichPreviewAnchor | null) => {
      if (!displayedRuntime) return;
      activateRichPane(displayedPath, { paneKey, groupId, tabId }, anchor);
    },
    [displayedPath, displayedRuntime, groupId, paneKey, tabId],
  );

  return (
    <div
      className="relative h-full min-h-0 overflow-hidden"
      data-pane-key={paneKey}
      data-testid="rich-document-pane"
    >
      <div
        className="absolute inset-0 h-full min-h-0"
        data-testid={
          isLive && displayedRuntime ? "rich-document-live-host" : undefined
        }
        ref={hostRef}
      />
      {!displayedRuntime ? (
        <div
          className="absolute inset-0 bg-[var(--bg-primary)]"
          data-testid="editor-pending-canvas"
        />
      ) : (
        <>
          <div
            aria-hidden={isLive}
            className="absolute inset-0 h-full min-h-0 overflow-hidden"
            data-testid="rich-preview-layer"
            style={{
              // 保留活动窗格的预绘内容，编辑器合成层切换时由其承接过渡画面。
              pointerEvents: isLive ? "none" : "auto",
              visibility: "visible",
            }}
          >
            <VirtualRichPreview
              cache={displayedRuntime.previewCache}
              isLive={isLive}
              onActivate={handleActivate}
              paneKey={paneKey}
            />
          </div>
          {!isLive && runtime && import.meta.env.DEV ? (
            <EditorSplitPaintCommit groupId={groupId} />
          ) : null}
        </>
      )}
    </div>
  );
}
