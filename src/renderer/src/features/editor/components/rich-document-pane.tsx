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
import { toRichPaneKey, type RichPaneKey } from "../lib/rich-pane-view-state";
import type { RichBlockNoteRuntime } from "./blocknote-editor";
import { EditorStateView } from "./editor-state-view";
import { VirtualRichPreview } from "./virtual-rich-preview";

interface RichDocumentPaneProps {
  groupId: string;
  tabId: string;
  path: string;
}

function activateRichPane(
  path: string,
  paneKey: RichPaneKey,
  runtime: RichBlockNoteRuntime,
): boolean {
  const normalizedPath = normalizeRichDocumentPath(path);
  const active = richDocumentSessionManager.getActiveBinding();
  if (active?.path === normalizedPath && active.binding.paneKey === paneKey) {
    return true;
  }

  if (active) {
    const activeRuntime = richDocumentSessionManager.getRuntime(
      active.path,
    ) as RichBlockNoteRuntime | null;
    if (activeRuntime) {
      richPaneViewStateRegistry.patch(
        active.binding.paneKey,
        activeRuntime.readViewState(),
      );
    }
  }

  if (!richDocumentSessionManager.setActivePane(normalizedPath, paneKey)) {
    return false;
  }
  runtime.restoreViewState(richPaneViewStateRegistry.read(paneKey));
  return true;
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
      releaseHost();
      releaseVisible();
    };
  }, [groupId, normalizedPath, paneKey, tabId]);

  useLayoutEffect(() => {
    if (!isLive || !runtime) return;
    // runtime 注册会触发路径级订阅；此处重新激活，不依赖偶然的 store 更新或轮询。
    activateRichPane(normalizedPath, paneKey, runtime);
  }, [isLive, normalizedPath, paneKey, runtime]);

  const handleActivate = useCallback(() => {
    if (!runtime) return;
    useEditorStore.getState().setActiveTab(groupId, tabId);
    activateRichPane(normalizedPath, paneKey, runtime);
  }, [groupId, normalizedPath, paneKey, runtime, tabId]);

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
      ) : isLive ? null : (
        <VirtualRichPreview
          cache={runtime.previewCache}
          onActivate={handleActivate}
          paneKey={paneKey}
        />
      )}
    </div>
  );
}
