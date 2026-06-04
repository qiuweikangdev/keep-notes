import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { SettingsModal } from "@/features/settings";
import { DiffViewer } from "@/features/diff";
import { useDiffStore } from "@/store/diff.store";
import { useEffect, useState } from "react";
import { X } from "lucide-react";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const [isMaximized, setIsMaximized] = useState(false);
  const { isOpen, oldContent, newContent, filePath, closeDiff } =
    useDiffStore();

  // 监听窗口最大化状态
  useEffect(() => {
    const checkMaximized = async () => {
      // 这里可以添加检查窗口是否最大化的逻辑
    };
    checkMaximized();
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      // Diff 面板打开时优先消费关闭快捷键，避免同时关闭编辑器标签页。
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "w") {
        event.preventDefault();
        event.stopPropagation();
        closeDiff();
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => {
      window.removeEventListener("keydown", handleKeyDown, { capture: true });
    };
  }, [closeDiff, isOpen]);

  // 获取文件名
  const fileName = filePath?.split(/[\\/]/).pop() || "";

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        borderRadius: isMaximized ? "0" : "8px",
      }}
    >
      {/* 编辑器桥接组件，用于与主进程通信 */}
      <EditorBridge />

      {/* 窗口边缘拖拽区域 */}
      <div className="resize-handle resize-handle-top" />
      <div className="resize-handle resize-handle-bottom" />
      <div className="resize-handle resize-handle-left" />
      <div className="resize-handle resize-handle-right" />
      <div className="resize-handle resize-handle-top-left" />
      <div className="resize-handle resize-handle-top-right" />
      <div className="resize-handle resize-handle-bottom-left" />
      <div className="resize-handle resize-handle-bottom-right" />

      {/* 标题栏 */}
      <TitleBar collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      {/* 主内容区域 */}
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId="main-layout">
          {/* 侧边栏 */}
          {!collapsed && (
            <>
              <Panel
                defaultSize={panelSize}
                minSize={15}
                maxSize={40}
                onResize={handleResize}
                className="min-w-[220px]"
              >
                <Sidebar />
              </Panel>
              <PanelResizeHandle
                className="w-[1px]"
                style={{
                  backgroundColor: "var(--border-color)",
                }}
              />
            </>
          )}

          {/* 编辑器 */}
          <Panel minSize={30}>
            <div
              className="h-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <Editor />
            </div>
          </Panel>

          {/* Diff 面板 */}
          {isOpen && (
            <>
              <PanelResizeHandle
                className="w-[1px]"
                style={{
                  backgroundColor: "var(--border-color)",
                }}
              />
              <Panel defaultSize={40} minSize={20}>
                <div className="h-full relative">
                  {/* 关闭按钮 */}
                  <button
                    onClick={closeDiff}
                    className="absolute top-2 right-2 z-10 flex items-center justify-center w-6 h-6 rounded-lg transition-all"
                    style={{
                      backgroundColor: "var(--bg-secondary)",
                      color: "var(--text-muted)",
                      border: "1px solid var(--border-color)",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.backgroundColor = "var(--hover-bg)";
                      e.currentTarget.style.color = "var(--text-primary)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.backgroundColor =
                        "var(--bg-secondary)";
                      e.currentTarget.style.color = "var(--text-muted)";
                    }}
                    title="关闭差异比较"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                  <DiffViewer
                    oldContent={oldContent}
                    newContent={newContent}
                    fileName={fileName}
                    oldTitle={`${fileName} (HEAD)`}
                    newTitle={`${fileName} (编辑器)`}
                  />
                </div>
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      {/* 设置弹窗 */}
      <SettingsModal />
    </div>
  );
}
