import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { PanelRightOpen, Undo2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { useElectron } from "@/hooks/use-electron";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import {
  DragResizeProvider,
  useDragResize,
} from "@/components/drag-resize-provider";
import { SettingsModal } from "@/features/settings";
import { DiffViewer, DiffPanel } from "@/features/diff";
import {
  DIFF_TOAST_AUTO_CLOSE_MS,
  DIFF_TOAST_EVENT,
  DIFF_NO_CHANGES_MESSAGE,
  isDiffToastDetail,
} from "@/features/diff/lib/diff-toast";
import { useDiffStore } from "@/store/diff.store";
import { useTreeStore } from "@/store/tree.store";
import { discardFileChanges } from "@/features/editor/lib/discard-file-changes";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
  type PointerEventHandler,
  type RefObject,
} from "react";

const DRAG_ACTIVATION_DISTANCE = 8;
const VIEWPORT_MARGIN = 16;

export function HomePage() {
  return (
    <DragResizeProvider>
      <HomePageContent />
    </DragResizeProvider>
  );
}

function HomePageContent() {
  const {
    panelSize,
    panelRef,
    collapsed,
    toggleCollapse,
    handleLayoutChange,
    handleLayoutChanged,
    handleCollapse,
    handleExpand,
    handleDidMount,
  } = usePanel();
  const [isMaximized] = useState(false);
  const {
    isOpen,
    isLoading,
    oldContent,
    newContent,
    filePath,
    source: diffSource,
    closeDiff,
  } = useDiffStore();
  const diffStore = useDiffStore();
  const { contentRef, resizeHandleProps, resetSize } = useResizableDialog();

  const electron = useElectron();
  const { loadTree, openFile } = electron;
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const [diffToastMessage, setDiffToastMessage] = useState<string | null>(null);
  const diffToastTimerRef = useRef<number | null>(null);

  const isMac = useMemo(() => {
    return window.electronAPI?.getPlatform() === "darwin";
  }, []);

  // 对话框打开时重置尺寸，使用 useLayoutEffect 在浏览器绘制前同步清除旧内联样式，避免闪烁
  useLayoutEffect(() => {
    if (isOpen) {
      resetSize();
    }
  }, [isOpen, resetSize]);

  useEffect(() => {
    const applyWindowTarget = async () => {
      const target = window.electronAPI.consumeWindowOpenTarget();
      if (!target) return;

      await loadTree(target.rootPath);
      if (target.filePath) {
        await openFile(target.filePath);
      }
    };

    void applyWindowTarget();

    return window.electronAPI.onWindowOpenTarget((target) => {
      void (async () => {
        await loadTree(target.rootPath);
        if (target.filePath) {
          await openFile(target.filePath);
        }
      })();
    });
  }, [loadTree, openFile]);

  const fileName = filePath?.split(/[\\/]/).pop() || "";

  useEffect(() => {
    return () => {
      if (diffToastTimerRef.current !== null) {
        window.clearTimeout(diffToastTimerRef.current);
      }
    };
  }, []);

  const showDiffToastMessage = useCallback((message: string) => {
    if (diffToastTimerRef.current !== null) {
      window.clearTimeout(diffToastTimerRef.current);
    }
    setDiffToastMessage(message);
    diffToastTimerRef.current = window.setTimeout(() => {
      setDiffToastMessage(null);
      diffToastTimerRef.current = null;
    }, DIFF_TOAST_AUTO_CLOSE_MS);
  }, []);

  useEffect(() => {
    const handleDiffToast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isDiffToastDetail(detail)) return;
      showDiffToastMessage(detail.message);
    };

    window.addEventListener(DIFF_TOAST_EVENT, handleDiffToast);
    return () => {
      window.removeEventListener(DIFF_TOAST_EVENT, handleDiffToast);
    };
  }, [showDiffToastMessage]);

  const handleMoveToPanel = () => {
    if (!filePath) return;
    diffStore.openDiff(filePath, oldContent, newContent);
    closeDiff();
  };

  const handleRequestDiscard = useCallback(() => {
    setConfirmDiscardOpen(true);
  }, []);

  const handleConfirmDiscard = async () => {
    // 二次确认后再判断是否存在可放弃内容，避免提前跳过确认弹窗。
    if (oldContent === newContent) {
      showDiffToastMessage(DIFF_NO_CHANGES_MESSAGE);
      return;
    }

    if (!filePath || !repositoryRoot) return;
    const result = await discardFileChanges(repositoryRoot, filePath, electron);
    if (!result.success) {
      showDiffToastMessage(DIFF_NO_CHANGES_MESSAGE);
      return;
    }

    if (result.noChanges) {
      showDiffToastMessage(DIFF_NO_CHANGES_MESSAGE);
      return;
    }

    closeDiff();
  };

  return (
    <div
      className="flex flex-col h-screen overflow-hidden relative"
      style={{
        backgroundColor: "var(--bg-primary)",
        color: "var(--text-primary)",
        borderRadius: isMac ? "0" : isMaximized ? "0" : "8px",
      }}
    >
      <EditorBridge />

      {!isMac && <div className="resize-handle resize-handle-top" />}
      <div className="resize-handle resize-handle-bottom" />
      <div className="resize-handle resize-handle-left" />
      <div className="resize-handle resize-handle-right" />
      {!isMac && <div className="resize-handle resize-handle-top-left" />}
      {!isMac && <div className="resize-handle resize-handle-top-right" />}
      <div className="resize-handle resize-handle-bottom-left" />
      <div className="resize-handle resize-handle-bottom-right" />

      <TitleBar collapsed={collapsed} onToggleCollapse={toggleCollapse} />

      <div className="flex-1 overflow-hidden">
        <PanelGroup
          direction="horizontal"
          onLayoutChange={handleLayoutChange}
          onLayoutChanged={handleLayoutChanged}
        >
          <Panel
            ref={panelRef}
            id="sidebar"
            defaultSize={panelSize}
            minSize={15}
            collapsedSize={0}
            collapsible
            onCollapse={handleCollapse}
            onExpand={handleExpand}
            onDidMount={handleDidMount}
          >
            <Sidebar />
          </Panel>
          <PanelResizeHandle
            className="group/resize"
            style={{
              width: "1px",
              minWidth: "1px",
              position: "relative",
              cursor: "col-resize",
            }}
          >
            <div
              className="absolute inset-y-0 -left-1 -right-1"
              style={{ backgroundColor: "var(--border-color)" }}
            />
          </PanelResizeHandle>

          <Panel minSize={30}>
            <div
              className="h-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <Editor />
            </div>
          </Panel>

          {diffStore.isOpen && (
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

      <DiffDialog
        isOpen={isOpen}
        onClose={closeDiff}
        contentRef={contentRef}
        resizeHandleProps={resizeHandleProps}
        fileName={fileName}
        isLoading={isLoading}
        oldContent={oldContent}
        newContent={newContent}
        filePath={filePath}
        repositoryRoot={repositoryRoot}
        showMutableActions={diffSource !== "history"}
        onDiscard={handleRequestDiscard}
        onMoveToPanel={handleMoveToPanel}
      />

      <SettingsModal />

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={setConfirmDiscardOpen}
        title="确认放弃更改"
        description={`确定要放弃 "${fileName || "当前文件"}" 的更改吗？`}
        confirmText="确定"
        onConfirm={handleConfirmDiscard}
      />

      {diffToastMessage ? <DiffToast message={diffToastMessage} /> : null}
    </div>
  );
}

function DiffToast({ message }: { message: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed right-5 top-12 z-[100] rounded-md border px-4 py-2 text-sm shadow-lg"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      {message}
    </div>
  );
}

// DiffDialog 封装弹窗，使用指针事件实现头部拖拽整个窗口。
function DiffDialog({
  isOpen,
  onClose,
  contentRef,
  resizeHandleProps,
  fileName,
  isLoading,
  oldContent,
  newContent,
  filePath,
  repositoryRoot,
  showMutableActions,
  onDiscard,
  onMoveToPanel,
}: {
  isOpen: boolean;
  onClose: () => void;
  contentRef: RefObject<HTMLDivElement | null>;
  resizeHandleProps: ReturnType<typeof useResizableDialog>["resizeHandleProps"];
  fileName: string;
  isLoading: boolean;
  oldContent: string;
  newContent: string;
  filePath: string | null;
  repositoryRoot: string | null;
  showMutableActions: boolean;
  onDiscard: () => void;
  onMoveToPanel: () => void;
}) {
  const { startDrag, endDrag } = useDragResize();

  // 防止弹窗打开时触发的 pointer 事件导致 DismissableLayer 立即关闭弹窗
  const openTimeRef = useRef(0);
  useLayoutEffect(() => {
    if (isOpen) {
      openTimeRef.current = Date.now();
    }
  }, [isOpen]);

  const handleOpenChange = useCallback(
    (open: boolean) => {
      if (!open) {
        // 弹窗刚打开时（150ms 内），忽略 DismissableLayer 的关闭请求
        if (Date.now() - openTimeRef.current < 150) return;
        onClose();
      }
    },
    [onClose],
  );

  // 拖拽会话
  const dragSessionRef = useRef<{
    pointerId: number;
    // 鼠标按下时的坐标
    downX: number;
    downY: number;
    // 鼠标相对于对话框左上角的偏移（激活时计算）
    offsetX: number;
    offsetY: number;
  } | null>(null);

  // 拖拽是否已激活（超过激活距离）
  const dragActivatedRef = useRef(false);

  const handleHeaderPointerDown: PointerEventHandler<HTMLElement> = (e) => {
    if (e.button !== 0 || !contentRef.current) return;
    e.preventDefault();

    dragSessionRef.current = {
      pointerId: e.pointerId,
      downX: e.clientX,
      downY: e.clientY,
      offsetX: 0,
      offsetY: 0,
    };
    dragActivatedRef.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handleHeaderPointerMove: PointerEventHandler<HTMLElement> = (e) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;
    if (!contentRef.current) return;

    const dx = e.clientX - session.downX;
    const dy = e.clientY - session.downY;

    // 激活距离检查
    if (!dragActivatedRef.current) {
      if (
        Math.abs(dx) < DRAG_ACTIVATION_DISTANCE &&
        Math.abs(dy) < DRAG_ACTIVATION_DISTANCE
      ) {
        return;
      }
      dragActivatedRef.current = true;
      startDrag();

      // 激活时：读取一次 rect，计算偏移，切换到绝对定位，然后直接返回
      // 避免在同一帧内读写交替导致布局抖动
      const target = contentRef.current;
      const rect = target.getBoundingClientRect();
      session.offsetX = e.clientX - rect.left;
      session.offsetY = e.clientY - rect.top;
      // 先禁用过渡动画，再切换定位方式，避免 duration-200 导致的闪跳
      target.style.setProperty("transition", "none", "important");
      target.style.setProperty("left", `${rect.left}px`, "important");
      target.style.setProperty("top", `${rect.top}px`, "important");
      target.style.setProperty("transform", "none", "important");
      return;
    }

    // 移动阶段：使用 offsetWidth/offsetHeight 避免 getBoundingClientRect 的布局开销
    const target = contentRef.current;
    const maxLeft = window.innerWidth - target.offsetWidth - VIEWPORT_MARGIN;
    const maxTop = window.innerHeight - target.offsetHeight - VIEWPORT_MARGIN;
    const newLeft = Math.max(
      VIEWPORT_MARGIN,
      Math.min(e.clientX - session.offsetX, maxLeft),
    );
    const newTop = Math.max(
      VIEWPORT_MARGIN,
      Math.min(e.clientY - session.offsetY, maxTop),
    );
    target.style.setProperty("left", `${newLeft}px`, "important");
    target.style.setProperty("top", `${newTop}px`, "important");
  };

  const handleHeaderPointerUp: PointerEventHandler<HTMLElement> = (e) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    dragSessionRef.current = null;
    if (dragActivatedRef.current) {
      dragActivatedRef.current = false;
      endDrag();
    }
    e.currentTarget.releasePointerCapture(e.pointerId);
  };

  const handleHeaderPointerCancel: PointerEventHandler<HTMLElement> = (_e) => {
    dragSessionRef.current = null;
    if (dragActivatedRef.current) {
      dragActivatedRef.current = false;
      endDrag();
    }
  };

  // 按钮阻止事件冒泡，避免触发拖拽
  const stopPropagation: PointerEventHandler = (_e) => _e.stopPropagation();

  return (
    <Dialog.Root open={isOpen} onOpenChange={handleOpenChange}>
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
        }}
      >
        {/* 头部拖拽区域：使用指针事件直接操作对话框元素的 left/top */}
        <div
          onPointerDown={handleHeaderPointerDown}
          onPointerMove={handleHeaderPointerMove}
          onPointerUp={handleHeaderPointerUp}
          onPointerCancel={handleHeaderPointerCancel}
          className="relative z-10 flex flex-shrink-0 select-none items-center justify-between border-b border-[var(--border-color)] px-4 py-3 pr-12"
          style={{ cursor: "default" }}
        >
          <Dialog.Title className="min-w-0 flex-1 truncate text-left text-sm font-semibold">
            {fileName || "文件"}差异
          </Dialog.Title>
          {showMutableActions && (
            <div className="flex flex-shrink-0 items-center gap-1">
              <button
                type="button"
                aria-label="放弃当前文件更改"
                title="放弃当前文件更改"
                onClick={(e) => {
                  e.stopPropagation();
                  onDiscard();
                }}
                onPointerDown={stopPropagation}
                disabled={!(filePath && repositoryRoot)}
                className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                style={{ color: "var(--danger-color, #dc2626)" }}
              >
                <Undo2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="将差异移到右侧面板"
                title="将差异移到右侧面板"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveToPanel();
                }}
                onPointerDown={stopPropagation}
                disabled={!filePath}
                className="rounded-sm p-1 opacity-70 transition-opacity hover:opacity-100 disabled:opacity-40"
                style={{ color: "var(--text-muted)" }}
              >
                <PanelRightOpen className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="关闭"
          title="关闭"
          onClick={onClose}
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

        {/* 8 个方向的 resize 拖拽句柄 */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
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
  );
}
