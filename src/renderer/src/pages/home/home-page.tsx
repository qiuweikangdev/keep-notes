import { useState, useCallback } from "react";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { Editor } from "@/features/editor";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { StatusBar } from "@/components/layout/status-bar";
import { useEditorStore } from "@/store/editor.store";
import { usePanel } from "@/hooks/use-panel";
import { SettingsModal } from "@/features/settings";
import { cn } from "@/lib/cn";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const { filePath } = useEditorStore();

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-[#fafafa] dark:bg-[#1a1a1a] text-foreground">
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
              <PanelResizeHandle className="w-[1px] bg-[#e5e5e5] dark:bg-[#333] hover:bg-[#0066ff] dark:hover:bg-[#4d9fff] transition-colors" />
            </>
          )}

          {/* 编辑器 */}
          <Panel minSize={30}>
            <Editor />
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
