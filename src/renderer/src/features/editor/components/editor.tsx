import { useState, useCallback, type CSSProperties } from "react";
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
} from "../lib/editor-drag-session";

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = [".md", ".txt"];

// 检查文件是否支持
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

function getPanelResizeHandleStyle(
  direction: "horizontal" | "vertical",
): CSSProperties {
  const baseStyle: CSSProperties = {
    backgroundColor: "var(--border-color)",
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
      cursor: "row-resize",
    };
  }

  return {
    ...baseStyle,
    width: "6px",
    minWidth: "6px",
    height: "100%",
    cursor: "col-resize",
  };
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
      <EditorTabBar groupId={groupId} />
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
  const panelGroups = useEditorStore
    .getState()
    .panelGroups.map(({ id, direction }) => ({ id, direction }));

  // 单面板组：直接渲染
  if (panelGroups.length === 1) {
    return (
      <div
        className="h-full overflow-hidden"
        style={{ backgroundColor: "var(--bg-primary)" }}
      >
        <EditorPanelGroup groupId={panelGroups[0].id} />
      </div>
    );
  }

  // 多面板组：递归嵌套 PanelGroup
  // 每次拆分时记录方向，相邻面板组之间使用该方向分割
  return (
    <div
      className="h-full overflow-hidden"
      style={{ backgroundColor: "var(--bg-primary)" }}
    >
      <NestedPanelGroups groups={panelGroups} />
    </div>
  );
}

// 递归渲染嵌套的面板组
function NestedPanelGroups({
  groups,
}: {
  groups: Array<{ id: string; direction: "horizontal" | "vertical" }>;
}) {
  if (groups.length === 1) {
    return (
      <div className="h-full relative">
        <EditorPanelGroup groupId={groups[0].id} />
      </div>
    );
  }

  // 取最后一个面板组的方向作为分割方向（因为它是最新的拆分）
  const lastGroup = groups[groups.length - 1];
  const direction = lastGroup.direction;
  const firstGroup = groups[0];
  const restGroups = groups.slice(1);

  return (
    <PanelGroup
      direction={direction}
      autoSaveId={`panel-group-${firstGroup.id}`}
    >
      <Panel minSize={20}>
        <div className="h-full relative">
          <EditorPanelGroup groupId={firstGroup.id} />
        </div>
      </Panel>
      <PanelResizeHandle
        style={getPanelResizeHandleStyle(direction)}
        hitAreaMargins={{ coarse: 30, fine: 20 }}
      />
      <Panel minSize={20}>
        <NestedPanelGroups groups={restGroups} />
      </Panel>
    </PanelGroup>
  );
}
