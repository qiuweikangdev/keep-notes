import { useState, useCallback } from "react";
import { EditorTabBar } from "./editor-tab-bar";
import { BlockNoteEditor } from "./blocknote-editor";
import { useEditorStore } from "@/store/editor.store";
import { useElectron } from "@/hooks/use-electron";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

// 支持的文件扩展名
const SUPPORTED_EXTENSIONS = [".md", ".txt"];

// 检查文件是否支持
function isSupportedFile(filePath: string): boolean {
  return SUPPORTED_EXTENSIONS.some((ext) => filePath.endsWith(ext));
}

// 单个面板组：标签栏 + 编辑器
function EditorPanelGroup({ groupId }: { groupId: string }) {
  const { panelGroups = [] } = useEditorStore();
  const { openFile } = useElectron();
  const group = panelGroups.find((g) => g.id === groupId);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);

      // 获取拖拽的文件路径
      const filePath = e.dataTransfer.getData("application/x-keep-notes-file");
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

      // 打开文件
      await openFile(filePath);
    },
    [groupId, openFile],
  );

  if (!group) return null;

  return (
    <div
      className="flex flex-col h-full overflow-hidden relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      <EditorTabBar groupId={groupId} />
      <div className="flex-1 overflow-hidden relative">
        <BlockNoteEditor groupId={groupId} tabId={group.activeTabId} />
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
  const { panelGroups = [] } = useEditorStore();

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
        style={{
          width: "6px",
          minWidth: "6px",
          backgroundColor: "var(--border-color)",
          cursor: "col-resize",
          position: "relative",
        }}
        hitAreaMargins={{ coarse: 30, fine: 20 }}
      />
      <Panel minSize={20}>
        <NestedPanelGroups groups={restGroups} />
      </Panel>
    </PanelGroup>
  );
}
