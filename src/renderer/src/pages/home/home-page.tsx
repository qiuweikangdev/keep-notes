import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelRightOpen, Undo2, X } from "lucide-react";
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { useElectron } from "@/hooks/use-electron";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { SettingsModal } from "@/features/settings";
import { DiffViewer, DiffPanel } from "@/features/diff";
import { useDiffStore } from "@/store/diff.store";
import { useDiffPanelStore } from "@/features/diff/store/diff-panel.store";
import { useTreeStore } from "@/store/tree.store";
import { discardFileChanges } from "@/features/editor/lib/discard-file-changes";
import { useEffect, useRef, useState, useMemo } from "react";

interface DialogOffset {
  x: number;
  y: number;
}

export function HomePage() {
  const { panelSize, collapsed, toggleCollapse, handleResize } = usePanel();
  const [isMaximized, setIsMaximized] = useState(false);
  const { isOpen, isLoading, oldContent, newContent, filePath, closeDiff } =
    useDiffStore();
  const diffPanel = useDiffPanelStore();
  const { contentRef, resizeHandleProps, resetSize } = useResizableDialog();
  const electron = useElectron();
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  // dnd-kit 拖拽结束后落盘的偏移量，渲染时以 transform 形式应用到 DialogContent。
  const [dialogOffset, setDialogOffset] = useState<DialogOffset>({ x: 0, y: 0 });

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
      setDialogOffset({ x: 0, y: 0 });
      resetSize();
    }
  }, [isOpen, resetSize]);

  // 获取文件名
  const fileName = filePath?.split(/[\\/]/).pop() || "";

  const handleMoveToPanel = () => {
    if (!filePath) return;
    diffPanel.open({ filePath, oldContent, newContent });
    closeDiff();
  };

  const handleConfirmDiscard = async () => {
    if (!filePath || !repositoryRoot) return;
    const result = await discardFileChanges(repositoryRoot, filePath, electron);
    if (result.success) {
      closeDiff();
    }
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
          showCloseButton={false}
          className="h-[82vh] w-[92vw] max-w-[1200px] flex-col gap-0 overflow-hidden sm:max-w-[1200px]"
          style={{
            display: "flex",
            padding: 0,
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
            // 拖拽落盘偏移以 transform 形式渲染，避免与 resize inline left/top 冲突。
            transform: `translate3d(${dialogOffset.x}px, ${dialogOffset.y}px, 0)`,
          }}
        >
          <DndContext>
            <DraggableHeader
              fileName={fileName}
              onDiscard={() => setConfirmDiscardOpen(true)}
              onMoveToPanel={handleMoveToPanel}
              canDiscard={Boolean(filePath && repositoryRoot)}
              canMove={Boolean(filePath)}
              onDragEnd={(offset) => {
                // 拖拽结束，把 dnd-kit 累加的位移写入 state；resize 期间 transform 会被它清空
                setDialogOffset({
                  x: dialogOffset.x + offset.x,
                  y: dialogOffset.y + offset.y,
                });
              }}
            />
          </DndContext>
          <button
            type="button"
            aria-label="关闭"
            title="关闭"
            onClick={closeDiff}
            className="absolute right-3 top-3 z-30 rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100"
            style={{ color: "var(--text-muted)" }}
          >
            <X className="h-4 w-4" />
          </button>
          <div className="min-h-0 flex-1">
            {isLoading ? (
              <div className="flex h-full items-center justify-center text-sm text-[var(--text-muted)]">
                正在加载差异…
              </div>
            ) : (
              <DiffViewer
                oldContent={oldContent}
                newContent={newContent}
                fileName={fileName}
                oldTitle={`${fileName} (HEAD)`}
                newTitle={`${fileName} (编辑器)`}
              />
            )}
          </div>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
          >
            <div
              className="pointer-events-auto absolute left-0 top-0 h-3 w-full cursor-n-resize"
              {...resizeHandleProps.n}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-0 h-3 w-full cursor-s-resize"
              {...resizeHandleProps.s}
            />
            <div
              className="pointer-events-auto absolute right-0 top-0 h-full w-3 cursor-e-resize"
              {...resizeHandleProps.e}
            />
            <div
              className="pointer-events-auto absolute left-0 top-0 h-full w-3 cursor-w-resize"
              {...resizeHandleProps.w}
            />
            <div
              className="pointer-events-auto absolute right-0 top-0 h-3 w-3 cursor-ne-resize"
              {...resizeHandleProps.ne}
            />
            <div
              className="pointer-events-auto absolute left-0 top-0 h-3 w-3 cursor-nw-resize"
              {...resizeHandleProps.nw}
            />
            <div
              className="pointer-events-auto absolute bottom-0 right-0 h-3 w-3 cursor-se-resize"
              {...resizeHandleProps.se}
            />
            <div
              className="pointer-events-auto absolute bottom-0 left-0 h-3 w-3 cursor-sw-resize"
              {...resizeHandleProps.sw}
            />
          </div>
        </DialogContent>
      </Dialog.Root>

      {/* 设置弹窗 */}
      <SettingsModal />

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="放弃文件更改"
        description={`将恢复“${fileName || "当前文件"}”到 Git 中的版本，此操作无法撤销。`}
        confirmText="放弃更改"
        variant="danger"
        onConfirm={handleConfirmDiscard}
      />
    </div>
  );
}

interface DraggableHeaderProps {
  fileName: string;
  canDiscard: boolean;
  canMove: boolean;
  onDiscard: () => void;
  onMoveToPanel: () => void;
  onDragEnd: (offset: DialogOffset) => void;
}

function DraggableHeader({
  fileName,
  canDiscard,
  canMove,
  onDiscard,
  onMoveToPanel,
  onDragEnd,
}: DraggableHeaderProps) {
  // 5px 激活阈值：用户点击按钮不会误触 drag，需移动 5px 才激活。
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
  );
  // 保存 dnd-kit transform 的引用，避免 React render 时引用变化。
  const lastTransformRef = useRef<DialogOffset>({ x: 0, y: 0 });

  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: "diff-dialog-header",
  });

  // 每次 transform 变化时缓存最后一次位移，drag 结束后一次性提交。
  if (transform) {
    lastTransformRef.current = { x: transform.x, y: transform.y };
  }

  const handleDragEnd = (_event: DragEndEvent) => {
    const final = lastTransformRef.current;
    if (final.x !== 0 || final.y !== 0) {
      onDragEnd(final);
      lastTransformRef.current = { x: 0, y: 0 };
    }
  };

  // 拖拽中：把 dnd-kit 的 transform 叠加到 inline transform 之外不能直接合并
  // （dnd-kit 会通过 setNodeRef 设置元素 transform，需要由我们与外层 dialogOffset 配合）。
  // 这里仅渲染 dnd-kit 的实时 transform，落盘到 state 后由外层 dialogOffset 接管。
  const dragStyle: React.CSSProperties | undefined = transform
    ? {
        transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
        cursor: "default",
      }
    : { cursor: "default" };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onDragEnd={handleDragEnd}
      className="relative z-10 flex flex-shrink-0 select-none items-center justify-between border-b border-[var(--border-color)] px-4 py-3 pr-12"
      style={dragStyle}
    >
      <Dialog.Title className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
        {fileName || "文件"}差异
      </Dialog.Title>
      <div className="flex flex-shrink-0 items-center gap-1">
        <button
          type="button"
          aria-label="放弃当前文件更改"
          title="放弃当前文件更改"
          onClick={(event) => {
            event.stopPropagation();
            onDiscard();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={!canDiscard}
          className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
          style={{ color: "var(--danger-color, #dc2626)" }}
        >
          <Undo2 className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label="将差异移到右侧面板"
          title="将差异移到右侧面板"
          onClick={(event) => {
            event.stopPropagation();
            onMoveToPanel();
          }}
          onPointerDown={(event) => event.stopPropagation()}
          disabled={!canMove}
          className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
          style={{ color: "var(--text-muted)" }}
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
