import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelRightOpen } from "lucide-react";
import { Dialog, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { useDraggableDialog } from "@/hooks/use-draggable-dialog";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { SettingsModal } from "@/features/settings";
import { DiffViewer, DiffPanel } from "@/features/diff";
import { useDiffStore } from "@/store/diff.store";
import { useDiffPanelStore } from "@/features/diff/store/diff-panel.store";
import { useEffect, useState, useMemo } from "react";

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const [isMaximized, setIsMaximized] = useState(false);
  const { isOpen, oldContent, newContent, filePath, closeDiff } =
    useDiffStore();
  const diffPanel = useDiffPanelStore();
  const { contentRef, dragHandleProps, resetPosition } = useDraggableDialog();
  const { resizeHandleProps, resetSize } = useResizableDialog();

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

  useEffect(() => {
    if (isOpen) {
      resetPosition();
      resetSize();
    }
  }, [isOpen, resetPosition, resetSize]);

  // 获取文件名
  const fileName = filePath?.split(/[\\/]/).pop() || "";

  const handleMoveToPanel = () => {
    if (!filePath) return;
    diffPanel.open({ filePath, oldContent, newContent });
    closeDiff();
  };

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

          {/* 差异面板 */}
          {diffPanel.isOpen && (
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
              <Panel defaultSize={28} minSize={18} maxSize={50}>
                <DiffPanel />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>

      <Dialog.Root
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) closeDiff();
        }}
      >
        <DialogContent
          ref={contentRef}
          className="flex h-[82vh] w-[92vw] max-w-[1200px] flex-col overflow-hidden p-0 sm:max-w-[1200px]"
        >
          <DialogHeader
            className="flex flex-shrink-0 cursor-move select-none touch-none items-center justify-between border-b border-[var(--border-color)] px-4 py-3 pr-12"
            {...dragHandleProps}
          >
            <Dialog.Title className="min-w-0 flex-1 truncate text-sm font-semibold">
              {fileName || "文件"}差异
            </Dialog.Title>
            <button
              type="button"
              aria-label="将差异移到右侧面板"
              title="将差异移到右侧面板"
              onClick={handleMoveToPanel}
              onPointerDown={(event) => event.stopPropagation()}
              disabled={!filePath}
              className="ml-2 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
              style={{ color: "var(--text-muted)" }}
            >
              <PanelRightOpen className="h-4 w-4" />
            </button>
          </DialogHeader>
          <div className="min-h-0 flex-1">
            <DiffViewer
              oldContent={oldContent}
              newContent={newContent}
              fileName={fileName}
              oldTitle={`${fileName} (HEAD)`}
              newTitle={`${fileName} (编辑器)`}
            />
          </div>
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="pointer-events-auto absolute left-0 top-0 h-2 w-full cursor-n-resize"
              {...resizeHandleProps.n}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-0 h-2 w-full cursor-s-resize"
              {...resizeHandleProps.s}
            />
            <div
              className="pointer-events-auto absolute right-0 top-0 h-full w-2 cursor-e-resize"
              {...resizeHandleProps.e}
            />
            <div
              className="pointer-events-auto absolute left-0 top-0 h-full w-2 cursor-w-resize"
              {...resizeHandleProps.w}
            />
            <div
              className="pointer-events-auto absolute right-0 top-0 h-2 w-2 cursor-ne-resize"
              {...resizeHandleProps.ne}
            />
            <div
              className="pointer-events-auto absolute left-0 top-0 h-2 w-2 cursor-nw-resize"
              {...resizeHandleProps.nw}
            />
            <div
              className="pointer-events-auto absolute bottom-0 right-0 h-2 w-2 cursor-se-resize"
              {...resizeHandleProps.se}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-0 h-2 w-2 cursor-sw-resize"
              {...resizeHandleProps.sw}
            />
          </div>
        </DialogContent>
      </Dialog.Root>

      {/* 设置弹窗 */}
      <SettingsModal />
    </div>
  );
}
