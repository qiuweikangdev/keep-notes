import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { EditorTabBar } from "./editor-tab-bar";
import { EditorWorkspace } from "./editor-workspace";
import { isSplitWarmupGroup, useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  selectEditorLayoutSignature,
  selectPanelGroupSignature,
} from "../lib/editor-view-selectors";
import {
  getDraggedFilePath,
  isEditorFileDrag,
} from "../lib/editor-drag-session";
import { EditorPanelSurfaceRegistry } from "../lib/editor-panel-surface-registry";
import { editorInstanceRegistry } from "../lib/editor-instance-registry";
import { richDocumentSessionManager } from "../lib/editor-runtime";
import { RichDocumentSessionHost } from "./rich-document-session-host";

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = [".md", ".txt"];

type PanelDirection = "horizontal" | "vertical";
type PanelGroupDescriptor = {
  id: string;
  direction: PanelDirection;
  splitParentGroupId?: string | null;
};
type PanelLayoutNode =
  | { type: "leaf"; id: string }
  | {
      type: "split";
      id: string;
      direction: PanelDirection;
      first: PanelLayoutNode;
      second: PanelLayoutNode;
    };

// 检查文件是否支持
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function getPanelResizeHandleStyle(
  direction: "horizontal" | "vertical",
): CSSProperties {
  const baseStyle: CSSProperties = {
    backgroundColor: "transparent",
    position: "relative",
    flexShrink: 0,
  };

  // 根据拆分方向切换拖拽手柄尺寸和鼠标样式，保证上下拆分可垂直拖动。
  if (direction === "vertical") {
    return {
      ...baseStyle,
      width: "100%",
      height: "6px",
      minHeight: "6px",
      borderLeft: "0",
      borderTop: "1px solid var(--border-color)",
      cursor: "row-resize",
    };
  }

  return {
    ...baseStyle,
    width: "6px",
    minWidth: "6px",
    height: "100%",
    borderLeft: "1px solid var(--border-color)",
    borderTop: "0",
    cursor: "col-resize",
  };
}

function createPanelLeaf(id: string): PanelLayoutNode {
  return { type: "leaf", id };
}

function createPanelSplit(
  parentGroupId: string,
  group: PanelGroupDescriptor,
  first: PanelLayoutNode,
): PanelLayoutNode {
  return {
    type: "split",
    id: `${parentGroupId}-${group.id}`,
    direction: group.direction,
    first,
    second: createPanelLeaf(group.id),
  };
}

function splitPanelLayout(
  node: PanelLayoutNode,
  parentGroupId: string,
  group: PanelGroupDescriptor,
): { node: PanelLayoutNode; didSplit: boolean } {
  if (node.type === "leaf") {
    if (node.id !== parentGroupId) {
      return { node, didSplit: false };
    }

    return {
      node: createPanelSplit(parentGroupId, group, node),
      didSplit: true,
    };
  }

  const firstResult = splitPanelLayout(node.first, parentGroupId, group);
  if (firstResult.didSplit) {
    return {
      node: { ...node, first: firstResult.node },
      didSplit: true,
    };
  }

  const secondResult = splitPanelLayout(node.second, parentGroupId, group);
  if (secondResult.didSplit) {
    return {
      node: { ...node, second: secondResult.node },
      didSplit: true,
    };
  }

  return { node, didSplit: false };
}

function buildPanelLayout(
  groups: PanelGroupDescriptor[],
): PanelLayoutNode | null {
  const firstGroup = groups[0];
  if (!firstGroup) return null;

  let layout = createPanelLeaf(firstGroup.id);

  for (const group of groups.slice(1)) {
    const parentGroupId = group.splitParentGroupId;
    if (parentGroupId) {
      const result = splitPanelLayout(layout, parentGroupId, group);
      if (result.didSplit) {
        layout = result.node;
        continue;
      }
    }

    // 兼容旧的扁平布局数据：没有父面板信息时继续沿用追加拆分。
    layout = createPanelSplit("legacy", group, layout);
  }

  return layout;
}

// 单个面板组：标签栏 + 编辑器
function EditorPanelGroup({ groupId }: { groupId: string }) {
  useEditorStore(selectPanelGroupSignature(groupId));
  const { openFile } = useElectron();
  const group = useEditorStore
    .getState()
    .panelGroups.find((item) => item.id === groupId);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    // 仅接管文件拖放，BlockNote 表格和普通块拖拽继续交给编辑器处理。
    if (!isEditorFileDrag(e.dataTransfer.types)) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    if (!isEditorFileDrag(e.dataTransfer.types)) {
      return;
    }
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isEditorFileDrag(e.dataTransfer.types)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      setIsDragOver(false);

      // 获取拖拽的文件路径
      const filePath = getDraggedFilePath(e.dataTransfer);
      if (!filePath || !isSupportedFile(filePath)) return;

      // 检查当前活动标签页是否已经是该文件
      const state = useEditorStore.getState();
      const activeGroup = state.panelGroups.find((g) => g.id === groupId);
      if (activeGroup) {
        const activeTab = activeGroup.tabs.find(
          (t) => t.id === activeGroup.activeTabId,
        );
        // 如果当前标签页已经是目标文件，不需要操作
        if (activeTab && activeTab.filePath === filePath) {
          return;
        }
      }

      // 打开文件，指定目标面板组
      await openFile(filePath, groupId);
    },
    [groupId, openFile],
  );

  if (!group) return null;

  // 没有标签页时显示空白状态
  if (!group.activeTabId || group.tabs.length === 0) {
    return (
      <div className="flex flex-col h-full overflow-hidden relative">
        <div
          className="flex-1 flex items-center justify-center relative"
          style={{ backgroundColor: "var(--bg-primary)" }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <div className="text-center" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">没有打开的文件</p>
            <p className="text-xs mt-1">从文件树点击或拖拽文件到此处打开</p>
          </div>
          {/* 拖拽高亮边框 */}
          {isDragOver && (
            <div
              className="absolute inset-0 pointer-events-none z-50"
              style={{
                border: "2px solid var(--accent-color)",
                backgroundColor: "var(--accent-color)",
                opacity: 0.1,
              }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {group.splitWarmup ? (
        <div className="h-[35px] flex-shrink-0" />
      ) : (
        <EditorTabBar groupId={groupId} />
      )}
      <div
        className="flex-1 overflow-hidden relative"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {/* 渲染编辑器 */}
        <EditorWorkspace groupId={groupId} tabId={group.activeTabId} />
        {/* 拖拽高亮边框 */}
        {isDragOver && (
          <div
            className="absolute inset-0 pointer-events-none z-50"
            style={{
              border: "2px solid var(--accent-color)",
              backgroundColor: "var(--accent-color)",
              opacity: 0.1,
            }}
          />
        )}
      </div>
    </div>
  );
}

export function Editor() {
  useEditorStore(selectEditorLayoutSignature);
  const [surfaceRegistry] = useState(() => new EditorPanelSurfaceRegistry());
  const storedPanelGroups = useEditorStore.getState().panelGroups;
  const allPanelGroups = storedPanelGroups.map(
    ({ id, direction, splitParentGroupId }) => ({
      id,
      direction,
      splitParentGroupId,
    }),
  );
  const panelGroups = storedPanelGroups
    .filter((group) => !isSplitWarmupGroup(group))
    .map(({ id, direction, splitParentGroupId }) => ({
      id,
      direction,
      splitParentGroupId,
    }));
  const panelLayout = buildPanelLayout(panelGroups);

  if (!panelLayout) return null;

  return (
    <div
      className="h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <SplitWarmupManager />
      <RootPanelLayout node={panelLayout} surfaceRegistry={surfaceRegistry} />
      <RichDocumentSessionLayer />
      {allPanelGroups.map(({ id }) => (
        <PersistentEditorPanel
          key={id}
          groupId={id}
          surfaceRegistry={surfaceRegistry}
        />
      ))}
    </div>
  );
}

const subscribeRetainedRichPaths = (listener: () => void) =>
  richDocumentSessionManager.subscribe(listener);
const getRetainedRichPathsSnapshot = () =>
  richDocumentSessionManager.getSnapshot();

export function RichDocumentSessionLayer() {
  const paths = useSyncExternalStore(
    subscribeRetainedRichPaths,
    getRetainedRichPathsSnapshot,
    getRetainedRichPathsSnapshot,
  );

  return paths.map((path) => (
    <RichDocumentSessionHost key={path} path={path} />
  ));
}

function selectSplitWarmupManagerSignature(
  state: ReturnType<typeof useEditorStore.getState>,
): string {
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId && !isSplitWarmupGroup(group),
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );
  const warmup = state.panelGroups.find(isSplitWarmupGroup);
  return [
    activeGroup?.id ?? "",
    activeTab?.id ?? "",
    activeTab?.filePath ?? "",
    activeTab?.mode ?? "",
    activeTab?.loadStatus ?? "",
    activeTab?.reloadKey ?? "",
    warmup?.id ?? "",
    warmup?.splitWarmup?.sourceGroupId ?? "",
    warmup?.splitWarmup?.sourceTabId ?? "",
    warmup?.splitWarmup?.status ?? "",
  ].join("\u001f");
}

function scheduleSplitWarmup(callback: () => void): () => void {
  const idleWindow = window as Window & {
    requestIdleCallback?: (callback: () => void) => number;
    cancelIdleCallback?: (handle: number) => void;
  };
  if (idleWindow.requestIdleCallback) {
    const handle = idleWindow.requestIdleCallback(callback);
    return () => idleWindow.cancelIdleCallback?.(handle);
  }

  const handle = window.setTimeout(callback, 0);
  return () => window.clearTimeout(handle);
}

function SplitWarmupManager() {
  const signature = useEditorStore(selectSplitWarmupManagerSignature);

  useEffect(() => {
    let cancelAttempt: (() => void) | null = null;
    let cancelled = false;
    const state = useEditorStore.getState();
    const activeGroup = state.panelGroups.find(
      (group) => group.id === state.activeGroupId && !isSplitWarmupGroup(group),
    );
    const activeTab = activeGroup?.tabs.find(
      (tab) => tab.id === activeGroup.activeTabId,
    );
    const warmup = state.panelGroups.find(isSplitWarmupGroup);
    for (const group of state.panelGroups) {
      if (!isSplitWarmupGroup(group)) {
        editorInstanceRegistry.setStandby(group.id, group.activeTabId, false);
      }
    }
    const canWarm =
      activeGroup &&
      activeTab?.filePath &&
      activeTab.mode === "rich" &&
      activeTab.loadStatus === "ready";

    if (!canWarm) {
      if (!warmup) return;
      return scheduleSplitWarmup(() => {
        useEditorStore.getState().discardSplitWarmup();
      });
    }

    if (
      warmup?.splitWarmup?.sourceGroupId === activeGroup.id &&
      warmup.splitWarmup.sourceTabId === activeTab.id &&
      warmup.splitWarmup.status !== "stale"
    ) {
      return;
    }

    const prepareWhenSourceIsReady = () => {
      cancelAttempt = null;
      if (cancelled) return;
      const latest = useEditorStore.getState();
      const latestGroup = latest.panelGroups.find(
        (group) => group.id === activeGroup.id && !isSplitWarmupGroup(group),
      );
      if (latestGroup?.activeTabId !== activeTab.id) return;

      if (
        !editorInstanceRegistry.getDocumentSnapshot(
          activeGroup.id,
          activeTab.id,
        )
      ) {
        // 编辑器尚未完成首轮装载时继续等待空闲期，不能用普通定时器抢占输入。
        cancelAttempt = scheduleSplitWarmup(prepareWhenSourceIsReady);
        return;
      }
      latest.prepareSplitWarmup(activeGroup.id);
    };

    cancelAttempt = scheduleSplitWarmup(prepareWhenSourceIsReady);
    return () => {
      cancelled = true;
      cancelAttempt?.();
    };
  }, [signature]);

  return null;
}

function PanelLeaf({
  groupId,
  surfaceRegistry,
}: {
  groupId: string;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  const hostRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    return surfaceRegistry.registerHost(groupId, host);
  }, [groupId, surfaceRegistry]);

  return (
    <div
      ref={hostRef}
      data-editor-panel-host={groupId}
      className="h-full min-h-0 overflow-hidden"
    />
  );
}

function PersistentEditorPanel({
  groupId,
  surfaceRegistry,
}: {
  groupId: string;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  const [surface] = useState(() => {
    const element = document.createElement("div");
    element.dataset.editorPanelSurface = groupId;
    element.className = "relative h-full min-h-0 overflow-hidden";
    return element;
  });

  useLayoutEffect(
    () => surfaceRegistry.registerSurface(groupId, surface),
    [groupId, surface, surfaceRegistry],
  );

  return createPortal(<EditorPanelGroup groupId={groupId} />, surface);
}

function RootPanelLayout({
  node,
  surfaceRegistry,
}: {
  node: PanelLayoutNode;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  const rootDirection = node.type === "split" ? node.direction : "horizontal";
  const firstNode = node.type === "split" ? node.first : node;

  return (
    <PanelGroup
      direction={rootDirection}
      autoSaveId={`panel-group-root-${rootDirection}`}
    >
      <Panel minSize={20}>
        <PanelLayout node={firstNode} surfaceRegistry={surfaceRegistry} />
      </Panel>
      {node.type === "split" ? (
        <>
          <PanelResizeHandle
            style={getPanelResizeHandleStyle(node.direction)}
            hitAreaMargins={{ coarse: 30, fine: 20 }}
          />
          <Panel minSize={20}>
            <PanelLayout node={node.second} surfaceRegistry={surfaceRegistry} />
          </Panel>
        </>
      ) : null}
    </PanelGroup>
  );
}

function PanelLayout({
  node,
  surfaceRegistry,
}: {
  node: PanelLayoutNode;
  surfaceRegistry: EditorPanelSurfaceRegistry;
}) {
  if (node.type === "leaf") {
    return <PanelLeaf groupId={node.id} surfaceRegistry={surfaceRegistry} />;
  }

  return (
    <PanelGroup
      direction={node.direction}
      autoSaveId={`panel-group-${node.id}`}
    >
      <Panel minSize={20}>
        <div className="h-full relative">
          <PanelLayout node={node.first} surfaceRegistry={surfaceRegistry} />
        </div>
      </Panel>
      <PanelResizeHandle
        style={getPanelResizeHandleStyle(node.direction)}
        hitAreaMargins={{ coarse: 30, fine: 20 }}
      />
      <Panel minSize={20}>
        <PanelLayout node={node.second} surfaceRegistry={surfaceRegistry} />
      </Panel>
    </PanelGroup>
  );
}
