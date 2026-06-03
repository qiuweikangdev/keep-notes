import { MilkdownEditor } from "./milkdown-editor";
import { useEditorStore } from "@/store/editor.store";
import { FileText, X } from "lucide-react";

interface EditorPanelProps {
  groupId: string;
  tabId: string;
}

export function EditorPanel({ groupId, tabId }: EditorPanelProps) {
  const {
    panelGroups = [],
    activeGroupId,
    setActiveTab,
    setTabFilePath,
    resetTab,
  } = useEditorStore();

  const group = panelGroups.find((g) => g.id === groupId);
  const tab = group?.tabs.find((t) => t.id === tabId);
  if (!tab) return null;

  const fileName = tab.filePath?.split(/[\\/]/).pop() || "";
  const isActive = activeGroupId === groupId && group?.activeTabId === tabId;

  const handleClose = () => {
    setTabFilePath(groupId, tabId, null);
    resetTab(groupId, tabId);
  };

  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        borderLeft: isActive ? "2px solid var(--accent-color)" : "none",
      }}
      onClick={() => setActiveTab(groupId, tabId)}
    >
      {/* 文件标签 */}
      {tab.filePath && (
        <div
          className="flex h-10 flex-shrink-0 items-center px-2"
          style={{
            backgroundColor: "var(--bg-secondary)",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          <div
            className="group flex h-7 items-center gap-2 rounded-md px-2.5 text-xs"
            style={{
              backgroundColor: "var(--bg-tertiary)",
              border: "1px solid var(--border-color)",
            }}
            title={tab.filePath}
          >
            <FileText
              className="h-3.5 w-3.5"
              style={{ color: "var(--text-muted)" }}
            />
            <span
              className="max-w-[220px] truncate"
              style={{ color: "var(--text-primary)" }}
            >
              {fileName}
            </span>
            {tab.isDirty ? (
              <span
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: "var(--accent-color)" }}
              />
            ) : null}
            <button
              onClick={handleClose}
              className="ml-1 rounded p-0.5 opacity-0 transition-all group-hover:opacity-100"
              style={{ color: "var(--text-muted)" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                e.currentTarget.style.color = "var(--text-primary)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = "transparent";
                e.currentTarget.style.color = "var(--text-muted)";
              }}
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
      )}

      {/* 编辑器内容 */}
      <div className="flex-1 overflow-hidden">
        <MilkdownEditor groupId={groupId} tabId={tabId} />
      </div>
    </div>
  );
}
