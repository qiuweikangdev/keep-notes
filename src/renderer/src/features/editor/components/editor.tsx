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
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  selectEditorLayoutSignature,
  selectPanelGroupSignature,
} from "../lib/editor-view-selectors";
import {
  getDraggedFilePath,
  isEditorFileDrag,
  isSupportedEditorFilePath,
} from "../lib/editor-drag-session";
import { EditorPanelSurfaceRegistry } from "../lib/editor-panel-surface-registry";
import { richDocumentSessionManager } from "../lib/editor-runtime";
import { RichDocumentSessionHost } from "./rich-document-session-host";
import {
  editorResizeFrameCoordinator,
  observeEditorLongTasks,
} from "../lib/editor-performance";
import { normalizeRichDocumentPath } from "../lib/rich-document-surface-registry";
import {
  getEditorDocumentPath,
  matchesEditorDocumentPath,
} from "../lib/editor-document-path";

// 鼠标不扩展命中区，避免覆盖相邻编辑器的滚动条；触控设备保留较大范围。
const EDITOR_PANEL_RESIZE_HIT_AREA_MARGINS = { coarse: 30, fine: 0 };

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

function readEditorPerformanceContext() {
  const state = useEditorStore.getState();
  const activeGroup = state.panelGroups.find(
    (group) => group.id === state.activeGroupId,
  );
  const activeTab = activeGroup?.tabs.find(
    (tab) => tab.id === activeGroup.activeTabId,
  );
  const activePath =
    activeTab?.mode === "rich"
      ? normalizeRichDocumentPath(getEditorDocumentPath(activeTab))
      : null;
  let visiblePaneCount = 0;
  if (activePath) {
    for (const group of state.panelGroups) {
      const tab = group.tabs.find(
        (candidate) => candidate.id === group.activeTabId,
      );
      if (tab?.mode === "rich" && matchesEditorDocumentPath(tab, activePath)) {
        visiblePaneCount += 1;
      }
    }
  }

  return {
    documentLength: activeTab?.content.length ?? 0,
    visiblePaneCount,
    mountedPreviewBlockCount:
      typeof document === "undefined"
        ? 0
        : document.querySelectorAll("[data-rich-preview-block]").length,
  };
}

const editorPanelGroupDiagnosticProps = import.meta.env.DEV
  ? { onLayout: editorResizeFrameCoordinator!.handleLayout }
  : {};

function EditorDevelopmentDiagnostics() {
  useEffect(() => {
    const disconnectLongTasks = observeEditorLongTasks(
      readEditorPerformanceContext,
    );
    return () => {
      disconnectLongTasks();
      editorResizeFrameCoordinator!.cancel();
    };
  }, []);
  return null;
}

function getPanelResizeHandleStyle(
  direction: "horizontal" | "vertical",
): CSSProperties {
  const baseStyle: CSSProperties = {
    backgroundColor: "transparent",
    position: "relative",
    flexShrink: 0,
    alignSelf: "stretch",
  };

  // 手柄只负责命中区域；视觉分割线由内部绝对定位元素绘制，避免百分比高度参与边框计算。
  if (direction === "vertical") {
    return {
      ...baseStyle,
      height: "6px",
      minHeight: "6px",
      cursor: "row-resize",
    };
  }

  return {
    ...baseStyle,
    width: "6px",
    minWidth: "6px",
    cursor: "col-resize",
  };
}

function getPanelResizeDividerStyle(
  direction: "horizontal" | "vertical",
): CSSProperties {
  const baseStyle: CSSProperties = {
    backgroundColor: "var(--border-color)",
    pointerEvents: "none",
    position: "absolute",
  };

  if (direction === "vertical") {
    return {
      ...baseStyle,
      top: "2px",
      left: 0,
      right: 0,
      height: "1px",
    };
  }

  return {
    ...baseStyle,
    top: 0,
    bottom: 0,
    left: "2px",
    width: "1px",
  };
}

function EditorPanelResizeHandle({ direction }: { direction: PanelDirection }) {
  return (
    <PanelResizeHandle
      style={getPanelResizeHandleStyle(direction)}
      hitAreaMargins={EDITOR_PANEL_RESIZE_HIT_AREA_MARGINS}
    >
      <div
        aria-hidden
        data-editor-panel-resize-divider
        style={getPanelResizeDividerStyle(direction)}
      />
    </PanelResizeHandle>
  );
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
  const isDragOver = useEditorStore(
    (state) => state.fileDragTargetGroupId === groupId,
  );
  const setFileDragTargetGroupId = useEditorStore(
    (state) => state.setFileDragTargetGroupId,
  );
  const clearFileDragTargetGroupId = useEditorStore(
    (state) => state.clearFileDragTargetGroupId,
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      // 仅接管文件拖放，BlockNote 表格和普通块拖拽继续交给编辑器处理。
      if (!isEditorFileDrag(e.dataTransfer.types)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "copy";
      setFileDragTargetGroupId(groupId);
    },
    [groupId, setFileDragTargetGroupId],
  );

  const handleDragLeave = useCallback(
    (e: React.DragEvent) => {
      if (!isEditorFileDrag(e.dataTransfer.types)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();

      const nextTarget = e.relatedTarget;
      if (nextTarget instanceof Node && e.currentTarget.contains(nextTarget)) {
        return;
      }
      clearFileDragTargetGroupId(groupId);
    },
    [clearFileDragTargetGroupId, groupId],
  );

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      if (!isEditorFileDrag(e.dataTransfer.types)) {
        return;
      }
      e.preventDefault();
      e.stopPropagation();
      clearFileDragTargetGroupId(groupId);

      // 获取拖拽的文件路径
      const filePath = getDraggedFilePath(e.dataTransfer);
      if (!filePath || !isSupportedEditorFilePath(filePath)) return;

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
    [clearFileDragTargetGroupId, groupId, openFile],
  );

  if (!group) return null;

  // 没有标签页时显示空白状态
  if (!group.activeTabId || group.tabs.length === 0) {
    return (
      <div
        className="flex flex-col h-full overflow-hidden relative"
        onDragOverCapture={handleDragOver}
        onDragLeaveCapture={handleDragLeave}
        onDropCapture={handleDrop}
      >
        <EditorTabBar groupId={groupId} />
        <div
          className="flex-1 flex items-center justify-center relative"
          style={{ backgroundColor: "var(--bg-primary)" }}
        >
          <div className="text-center" style={{ color: "var(--text-muted)" }}>
            <p className="text-sm">没有打开的文件</p>
            <p className="text-xs mt-1">从文件树点击或拖拽文件到此处打开</p>
          </div>
        </div>
        {/* 面板统一接管拖拽，确保标签栏、工具按钮和编辑器内容拥有一致的落点。 */}
        {isDragOver && (
          <div
            data-editor-file-drop-overlay={groupId}
            className="absolute inset-0 pointer-events-none z-50"
            style={{
              border: "2px solid var(--accent-color)",
              backgroundColor: "var(--accent-color)",
              opacity: 0.1,
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragOverCapture={handleDragOver}
      onDragLeaveCapture={handleDragLeave}
      onDropCapture={handleDrop}
    >
      <EditorTabBar groupId={groupId} />
      <div className="flex-1 overflow-hidden relative">
        {/* 渲染编辑器 */}
        <EditorWorkspace groupId={groupId} tabId={group.activeTabId} />
      </div>
      {/* 拖拽高亮覆盖整个面板，反馈与实际可放置区域保持一致。 */}
      {isDragOver && (
        <div
          data-editor-file-drop-overlay={groupId}
          className="absolute inset-0 pointer-events-none z-50"
          style={{
            border: "2px solid var(--accent-color)",
            backgroundColor: "var(--accent-color)",
            opacity: 0.1,
          }}
        />
      )}
    </div>
  );
}

export function Editor() {
  useEditorStore(selectEditorLayoutSignature);
  const clearFileDragTargetGroupId = useEditorStore(
    (state) => state.clearFileDragTargetGroupId,
  );
  const [surfaceRegistry] = useState(() => new EditorPanelSurfaceRegistry());
  const storedPanelGroups = useEditorStore.getState().panelGroups;
  const panelGroups = storedPanelGroups.map(
    ({ id, direction, splitParentGroupId }) => ({
      id,
      direction,
      splitParentGroupId,
    }),
  );
  const panelLayout = buildPanelLayout(panelGroups);

  useEffect(() => {
    const clearFileDragTarget = () => clearFileDragTargetGroupId();
    document.addEventListener("dragend", clearFileDragTarget);
    return () => document.removeEventListener("dragend", clearFileDragTarget);
  }, [clearFileDragTargetGroupId]);

  if (!panelLayout) return null;

  return (
    <div
      className="h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <RootPanelLayout node={panelLayout} surfaceRegistry={surfaceRegistry} />
      {import.meta.env.DEV ? <EditorDevelopmentDiagnostics /> : null}
      <RichDocumentSessionLayer />
      {panelGroups.map(({ id }) => (
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
      {...editorPanelGroupDiagnosticProps}
    >
      <Panel minSize={20}>
        <PanelLayout node={firstNode} surfaceRegistry={surfaceRegistry} />
      </Panel>
      {node.type === "split" ? (
        <>
          <EditorPanelResizeHandle direction={node.direction} />
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
      {...editorPanelGroupDiagnosticProps}
    >
      <Panel minSize={20}>
        <div className="h-full relative">
          <PanelLayout node={node.first} surfaceRegistry={surfaceRegistry} />
        </div>
      </Panel>
      <EditorPanelResizeHandle direction={node.direction} />
      <Panel minSize={20}>
        <PanelLayout node={node.second} surfaceRegistry={surfaceRegistry} />
      </Panel>
    </PanelGroup>
  );
}
