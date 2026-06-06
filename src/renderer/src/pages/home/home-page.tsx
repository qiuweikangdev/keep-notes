import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { SettingsModal } from "@/features/settings";
import { DiffViewer } from "@/features/diff";
import { useDiffStore } from "@/store/diff.store";
import { useEffect, useState, useMemo } from "react";
import { X } from "lucide-react";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const [isMaximized, setIsMaximized] = useState(false);
  const { isOpen, oldContent, newContent, filePath, closeDiff } =
    useDiffStore();

  // 平台判断
  const isMac = useMemo(() => {
    return window.electronAPI?.getPlatform() === "darwin";
  }, []);

  // 监听窗口最大化状态
  useEffect(() => {
    const checkMaximized = async () => {
      // 这里可以添加检查窗口是否最大化的逻辑
    };
    checkMaximized();
  }, []);

  // 获取文件名
  const fileName = filePath?.split(/[\\/]/).pop() || "";

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        // macOS 原生窗口自带圆角，不需要设置 borderRadius
        // Windows/Linux 无边框窗口需要 borderRadius 来实现圆角效果
        borderRadius: isMac ? "0" : isMaximized ? "0" : "8px",
      }}
    >
      {/* 编辑器桥接组件，用于与主进程通信 */}
      <EditorBridge />

      {/* 窗口边缘拖拽区域 - macOS 原生处理顶部拖拽，仅 Windows 需要 */}
      {!isMac && <div className="resize-handle resize-handle-top" />}
      <div className="resize-handle resize-handle-bottom" />
      <div className="resize-handle resize-handle-left" />
      <div className="resize-handle resize-handle-right" />
      {!isMac && <div className="resize-handle resize-handle-top-left" />}
      {!isMac && <div className="resize-handle resize-handle-top-right" />}
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
              >
                <Sidebar />
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
                style={{
                  width: "6px",
                  minWidth: "6px",
                  backgroundColor: "var(--border-color)",
                  cursor: "col-resize",
                  position: "relative",
                }}
                hitAreaMargins={{ coarse: 30, fine: 20 }}
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
