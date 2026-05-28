import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Editor } from "@/features/editor";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { StatusBar } from "@/components/layout/status-bar";
import { usePanel } from "@/hooks/use-panel";
import { SettingsModal } from "@/features/settings";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
      }}
    >
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

      {/* 状态栏 */}
      <StatusBar />

      {/* 设置弹窗 */}
      <SettingsModal />
    </div>
  );
}
