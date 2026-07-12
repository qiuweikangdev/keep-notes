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
import { EditorStateView } from "./editor-state-view";
import { VirtualRichPreview } from "./virtual-rich-preview";

interface RichDocumentPaneProps {
  groupId: string;
  tabId: string;
  path: string;
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
  const isLive = useEditorStore(
    (state) =>
      state.activeGroupId === groupId &&
      state.panelGroups.find((group) => group.id === groupId)?.activeTabId ===
        tabId,
  );

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // 同一次提交先注册可见 binding 和稳定 host，后续激活 effect 才能在首帧接管 surface。
    const releaseVisible = richDocumentSessionManager.retainVisible(
      normalizedPath,
      { paneKey, groupId, tabId },
    );
    const releaseHost = richDocumentSurfaceRegistry.registerHost(
      normalizedPath,
      paneKey,
      host,
    );
    return () => {
      richDocumentSessionManager.deactivateIfActive(normalizedPath, paneKey);
      releaseHost();
      releaseVisible();
      queueMicrotask(() => {
        const paneStillExists = useEditorStore
          .getState()
          .panelGroups.find((group) => group.id === groupId)
          ?.tabs.some((tab) => tab.id === tabId);
        if (!paneStillExists) richPaneViewStateRegistry.delete(paneKey);
      });
    };
  }, [groupId, normalizedPath, paneKey, tabId]);

  useLayoutEffect(() => {
    if (!isLive || !runtime) {
      richDocumentSessionManager.deactivateIfActive(normalizedPath, paneKey);
      return;
    }
    // runtime 注册会触发路径级订阅；此处重新激活，不依赖偶然的 store 更新或轮询。
    attachRichPane(normalizedPath, paneKey);
    return () => {
      richDocumentSessionManager.deactivateIfActive(normalizedPath, paneKey);
    };
  }, [isLive, normalizedPath, paneKey, runtime]);

  const handleActivate = useCallback(
    (anchor: RichPreviewAnchor | null) => {
      if (!runtime) return;
      activateRichPane(normalizedPath, { paneKey, groupId, tabId }, anchor);
    },
    [groupId, normalizedPath, paneKey, runtime, tabId],
  );

  const fileName = path.split(/[\\/]/).pop();
  return (
    <div
      className="relative h-full min-h-0 overflow-hidden"
      data-pane-key={paneKey}
      data-testid="rich-document-pane"
    >
      <div
        className="absolute inset-0 h-full min-h-0"
        data-testid={isLive && runtime ? "rich-document-live-host" : undefined}
        ref={hostRef}
      />
      {!runtime ? (
        <EditorStateView status="loading" fileName={fileName} />
      ) : (
        <>
          <div
            aria-hidden={isLive}
            className="absolute inset-0 h-full min-h-0 overflow-hidden"
            data-testid="rich-preview-layer"
            style={{
              pointerEvents: isLive ? "none" : "auto",
              visibility: isLive ? "hidden" : "visible",
            }}
          >
            <VirtualRichPreview
              cache={runtime.previewCache}
              onActivate={handleActivate}
              paneKey={paneKey}
            />
          </div>
          {!isLive && import.meta.env.DEV ? (
            <EditorSplitPaintCommit groupId={groupId} />
          ) : null}
        </>
      )}
    </div>
  );
}
