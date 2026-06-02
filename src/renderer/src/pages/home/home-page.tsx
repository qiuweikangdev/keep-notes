import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { SettingsModal } from "@/features/settings";
import { useEffect, useState } from "react";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const [isMaximized, setIsMaximized] = useState(false);

  // 监听窗口最大化状态
  useEffect(() => {
    const checkMaximized = async () => {
      // 这里可以添加检查窗口是否最大化的逻辑
    };
    checkMaximized();
  }, []);

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
        </PanelGroup>
      </div>

      {/* 设置弹窗 */}
      <SettingsModal />
    </div>
  );
}
