import { EditorTabBar } from "./editor-tab-bar";
import { BlockNoteEditor } from "./blocknote-editor";
import { useEditorStore } from "@/store/editor.store";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";

// 单个面板组：标签栏 + 编辑器
function EditorPanelGroup({ groupId }: { groupId: string }) {
  const { panelGroups = [] } = useEditorStore();
  const group = panelGroups.find((g) => g.id === groupId);
  if (!group) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <EditorTabBar groupId={groupId} />
      <div className="flex-1 overflow-hidden">
        <BlockNoteEditor groupId={groupId} tabId={group.activeTabId} />
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
        className="w-[1px]"
        style={{ backgroundColor: "var(--border-color)" }}
      />
      <Panel minSize={20}>
        <NestedPanelGroups groups={restGroups} />
      </Panel>
    </PanelGroup>
  );
}
