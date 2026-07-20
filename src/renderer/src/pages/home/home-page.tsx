import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import { CircleAlert, Info, PanelRightOpen, Undo2, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { DialogResizeHandles } from "@/components/ui/dialog-resize-handles";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Editor } from "@/features/editor";
import { EditorBridge } from "@/features/editor/components/editor-bridge";
import { Sidebar } from "@/components/layout/sidebar";
import { TitleBar } from "@/components/layout/title-bar";
import { usePanel } from "@/hooks/use-panel";
import { useElectron } from "@/hooks/use-electron";
import { useResizableDialog } from "@/hooks/use-resizable-dialog";
import { DiffViewer, DiffPanel } from "@/features/diff";
import {
  DIFF_TOAST_AUTO_CLOSE_MS,
  DIFF_TOAST_EVENT,
  DIFF_NO_CHANGES_MESSAGE,
  isDiffToastDetail,
} from "@/features/diff/lib/diff-toast";
import { areDiffContentsEqual } from "@/features/diff/lib/diff-content";
import { useDiffStore } from "@/store/diff.store";
import { useDiffPanelStore } from "@/features/diff/store/diff-panel.store";
import { useTreeStore } from "@/store/tree.store";
import { discardFileChanges } from "@/features/editor/lib/discard-file-changes";
import {
  APP_TOAST_EVENT,
  isAppToastDetail,
  type AppToastVariant,
} from "@/lib/app-toast";
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
import { createPortal } from "react-dom";

export function HomePage() {
  return <HomePageContent />;
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
  const isOpen = useDiffStore((state) => state.isOpen);
  const isLoading = useDiffStore((state) => state.isLoading);
  const oldContent = useDiffStore((state) => state.oldContent);
  const newContent = useDiffStore((state) => state.newContent);
  const filePath = useDiffStore((state) => state.filePath);
  const diffSource = useDiffStore((state) => state.source);
  const closeDiff = useDiffStore((state) => state.closeDiff);
  const isDiffPanelOpen = useDiffPanelStore((state) => state.isOpen);
  const openDiffPanel = useDiffPanelStore((state) => state.open);
  const { contentRef, dragHandleProps, resizeHandleProps } = useResizableDialog(
    { isOpen },
  );
  const [isSidebarResizing, setIsSidebarResizing] = useState(false);

  const electron = useElectron();
  const { loadTree, openFile } = electron;
  const repositoryRoot = useTreeStore((state) => state.treeRoot?.key ?? null);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const confirmDiscardOpenRef = useRef(false);
  const [toast, setToast] = useState<{
    message: string;
    variant: AppToastVariant;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const isMac = useMemo(() => {
    return window.electronAPI?.getPlatform() === "darwin";
  }, []);

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
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, []);

  const showToastMessage = useCallback(
    (message: string, variant: AppToastVariant = "info") => {
      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
      setToast({ message, variant });
      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, DIFF_TOAST_AUTO_CLOSE_MS);
    },
    [],
  );

  useEffect(() => {
    const handleDiffToast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isDiffToastDetail(detail)) return;
      showToastMessage(detail.message);
    };

    const handleAppToast = (event: Event) => {
      const detail = (event as CustomEvent<unknown>).detail;
      if (!isAppToastDetail(detail)) return;
      showToastMessage(detail.message, detail.variant);
    };

    window.addEventListener(DIFF_TOAST_EVENT, handleDiffToast);
    window.addEventListener(APP_TOAST_EVENT, handleAppToast);
    return () => {
      window.removeEventListener(DIFF_TOAST_EVENT, handleDiffToast);
      window.removeEventListener(APP_TOAST_EVENT, handleAppToast);
    };
  }, [showToastMessage]);

  const handleMoveToPanel = () => {
    if (!filePath) return;
    // 右侧面板使用独立 store，避免关闭弹窗时把面板也一起关闭。
    openDiffPanel({ filePath, oldContent, newContent });
    closeDiff();
  };

  const handleRequestDiscard = useCallback(() => {
    confirmDiscardOpenRef.current = true;
    setConfirmDiscardOpen(true);
  }, []);

  const handleDiffClose = useCallback(() => {
    // 确认框通过 Portal 打开时会被外层 Dialog 识别为外部交互，此时不能清空差异状态。
    if (confirmDiscardOpenRef.current) return;
    closeDiff();
  }, [closeDiff]);

  const handleConfirmDiscardOpenChange = useCallback((open: boolean) => {
    confirmDiscardOpenRef.current = open;
    setConfirmDiscardOpen(open);
  }, []);

  const handleConfirmDiscard = async () => {
    // 二次确认后再判断是否存在可放弃内容，避免提前跳过确认弹窗。
    if (areDiffContentsEqual(oldContent, newContent)) {
      showToastMessage(DIFF_NO_CHANGES_MESSAGE);
      return;
    }

    if (!filePath || !repositoryRoot) return;
    // 弹窗中已展示了明确差异，确认后直接执行，避免再次读取瞬时 Git 状态造成误判。
    const result = await discardFileChanges(
      repositoryRoot,
      filePath,
      electron,
      {
        skipChangeCheck: true,
      },
    );
    if (!result.success) {
      showToastMessage("放弃更改失败", "error");
      return;
    }

    if (result.noChanges) {
      showToastMessage(DIFF_NO_CHANGES_MESSAGE);
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
            onDragging={setIsSidebarResizing}
          >
            {isSidebarResizing ? (
              <div
                data-testid="sidebar-panel-resize-divider"
                className="absolute inset-y-0 left-1/2 -translate-x-1/2"
                style={{ width: "3px", backgroundColor: "var(--border-color)" }}
              />
            ) : null}
          </PanelResizeHandle>

          <Panel minSize={30}>
            <div
              className="h-full overflow-hidden"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <Editor />
            </div>
          </Panel>

          {isDiffPanelOpen && (
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
        onClose={handleDiffClose}
        contentRef={contentRef}
        dragHandleProps={dragHandleProps}
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

      <ConfirmDialog
        open={confirmDiscardOpen}
        onOpenChange={handleConfirmDiscardOpenChange}
        title="确认放弃更改"
        description={`确定要放弃 "${fileName || "当前文件"}" 的更改吗？`}
        variant="warning"
        confirmText="确定"
        onConfirm={handleConfirmDiscard}
      />

      {toast ? (
        <AppToast message={toast.message} variant={toast.variant} />
      ) : null}
    </div>
  );
}

function AppToast({
  message,
  variant,
}: {
  message: string;
  variant: AppToastVariant;
}) {
  const ToastIcon = variant === "error" ? CircleAlert : Info;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      data-variant={variant}
      className="app-toast pointer-events-none fixed left-1/2 top-14 z-[100] flex w-[calc(100vw-24px)] max-w-[320px] items-center gap-2 rounded-lg px-2.5 py-2 text-sm"
    >
      <span className="app-toast__icon flex h-5 w-5 shrink-0 items-center justify-center">
        <ToastIcon aria-hidden="true" className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 break-words leading-5">{message}</span>
    </div>,
    document.body,
  );
}

// DiffDialog 封装弹窗，使用指针事件实现头部拖拽整个窗口。
function DiffDialog({
  isOpen,
  onClose,
  contentRef,
  dragHandleProps,
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
  dragHandleProps: ReturnType<typeof useResizableDialog>["dragHandleProps"];
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

  // 按钮阻止事件冒泡，避免触发拖拽
  const stopPropagation: PointerEventHandler = (_e) => _e.stopPropagation();

  return (
    <Dialog.Root modal={false} open={isOpen} onOpenChange={handleOpenChange}>
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
          data-dialog-drag-handle
          {...dragHandleProps}
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
              reserveDialogResizeHandleSpace
            />
          )}
        </div>

        <DialogResizeHandles resizeHandleProps={resizeHandleProps} />
      </DialogContent>
    </Dialog.Root>
  );
}
