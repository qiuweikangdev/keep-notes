import type { PropsWithChildren } from "react";
import {
  act,
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { useTreeStore } from "@/store/tree.store";
import { DIFF_TOAST_EVENT } from "@/features/diff/lib/diff-toast";
import { APP_TOAST_EVENT } from "@/lib/app-toast";

const closeDiff = vi.fn();
const discardFileChangesMock = vi.hoisted(() => vi.fn());
const dialogRootStateMock = vi.hoisted(() => ({
  onOpenChange: null as ((open: boolean) => void) | null,
}));
const diffStateMock = vi.hoisted(() => ({
  isOpen: true,
  source: "worktree" as "worktree" | "history",
  oldContent: "# old",
  newContent: "# new",
}));

vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelResizeHandle: ({
    children,
    onDragging,
    ...props
  }: PropsWithChildren<{ onDragging?: (isDragging: boolean) => void }>) => (
    <div
      data-testid="sidebar-panel-resize-handle"
      onPointerDown={() => onDragging?.(true)}
      onPointerUp={() => onDragging?.(false)}
      {...props}
    >
      {children}
    </div>
  ),
}));

vi.mock("@/components/ui/dialog", () => ({
  ...(() => {
    const React = require("react");
    return {
      Dialog: {
        Root: ({
          children,
          open,
          onOpenChange,
        }: PropsWithChildren<{
          open?: boolean;
          onOpenChange?: (open: boolean) => void;
        }>) => {
          dialogRootStateMock.onOpenChange = onOpenChange ?? null;
          return open ? <div data-testid="dialog-root">{children}</div> : null;
        },
        Title: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
      },
      DialogContent: React.forwardRef(
        (
          {
            children,
            showCloseButton: _showCloseButton,
            ...props
          }: PropsWithChildren<{ showCloseButton?: boolean }>,
          ref: React.ForwardedRef<HTMLDivElement>,
        ) => (
          <div ref={ref} data-testid="diff-dialog-content" {...props}>
            {children}
          </div>
        ),
      ),
      DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
    };
  })(),
}));

vi.mock("@/features/editor", () => ({
  Editor: () => <div>Editor</div>,
}));

vi.mock("@/features/editor/components/editor-bridge", () => ({
  EditorBridge: () => null,
}));

vi.mock("@/features/editor/lib/discard-file-changes", () => ({
  discardFileChanges: discardFileChangesMock,
}));

vi.mock("@/components/layout/sidebar", () => ({
  Sidebar: () => <div>Sidebar</div>,
}));

vi.mock("@/components/layout/title-bar", () => ({
  TitleBar: () => <div>TitleBar</div>,
}));

vi.mock("@/hooks/use-panel", () => ({
  usePanel: () => ({
    panelSize: 20,
    collapsed: false,
    toggleCollapse: vi.fn(),
    handleResize: vi.fn(),
  }),
}));

vi.mock("@/features/settings", () => ({
  SettingsModal: () => null,
}));

vi.mock("@/features/diff", () => ({
  DiffViewer: () => <div>DiffViewer</div>,
}));

vi.mock("@/components/ui/confirm-dialog", () => ({
  ConfirmDialog: ({
    open,
    onOpenChange,
    title,
    description,
    confirmText = "确认",
    onConfirm,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    description: string;
    confirmText?: string;
    onConfirm: () => void | Promise<void>;
  }) =>
    open ? (
      <div role="dialog">
        <h2>{title}</h2>
        <p>{description}</p>
        <button
          type="button"
          onClick={async () => {
            await onConfirm();
            onOpenChange(false);
          }}
        >
          {confirmText}
        </button>
      </div>
    ) : null,
}));

vi.mock("@/store/diff.store", () => {
  return {
    useDiffStore: (
      selector: (value: {
        isOpen: boolean;
        isLoading: boolean;
        oldContent: string;
        newContent: string;
        filePath: string;
        source: "worktree" | "history";
        closeDiff: typeof closeDiff;
      }) => unknown,
    ) =>
      selector({
        isOpen: diffStateMock.isOpen,
        isLoading: false,
        oldContent: diffStateMock.oldContent,
        newContent: diffStateMock.newContent,
        filePath: "D:\\notes\\readme.md",
        source: diffStateMock.source,
        closeDiff,
      }),
  };
});

import { HomePage } from "./home-page";

function render(
  ui: Parameters<typeof baseRender>[0],
  options?: Parameters<typeof baseRender>[1],
) {
  return baseRender(ui, {
    ...options,
    wrapper: ({ children }) => (
      <DragResizeProvider debounceMs={0}>{children}</DragResizeProvider>
    ),
  });
}

describe("HomePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    dialogRootStateMock.onOpenChange = null;
    diffStateMock.isOpen = true;
    diffStateMock.source = "worktree";
    diffStateMock.oldContent = "# old";
    diffStateMock.newContent = "# new";
    discardFileChangesMock.mockResolvedValue({ success: false });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "win32",
        consumeWindowOpenTarget: () => null,
        onWindowOpenTarget: () => () => undefined,
      },
    });
    useTreeStore.setState({
      treeRoot: { title: "notes", key: "D:\\notes" },
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("shows the 3px sidebar divider only while resizing", () => {
    render(<HomePage />);

    const handle = screen.getByTestId("sidebar-panel-resize-handle");
    expect(
      screen.queryByTestId("sidebar-panel-resize-divider"),
    ).not.toBeInTheDocument();

    fireEvent.pointerDown(handle, { pointerId: 1, button: 0 });

    expect(screen.getByTestId("sidebar-panel-resize-divider")).toHaveStyle({
      width: "3px",
      backgroundColor: "var(--border-color)",
    });

    fireEvent.pointerUp(handle, { pointerId: 1 });

    expect(
      screen.queryByTestId("sidebar-panel-resize-divider"),
    ).not.toBeInTheDocument();
  });

  it("renders the diff popup through the Radix dialog root", () => {
    render(<HomePage />);

    expect(screen.getByTestId("dialog-root")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "readme.md差异" }),
    ).toBeInTheDocument();
    expect(screen.getByText("DiffViewer")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "放弃当前文件更改" }),
    ).toBeInTheDocument();
  });

  it("uses the shared drag handle and all resize handles", () => {
    render(<HomePage />);

    expect(document.querySelector("[data-dialog-drag-handle]")).not.toBeNull();
    expect(
      document.querySelectorAll("[data-dialog-resize-handle]"),
    ).toHaveLength(8);
  });

  it("hides mutable actions for history diff popups", () => {
    diffStateMock.source = "history";

    render(<HomePage />);

    expect(
      screen.queryByRole("button", { name: "放弃当前文件更改" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "将差异移到右侧面板" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "关闭" })).toBeInTheDocument();
  });

  it("shows a no-change toast after confirming discard when diff contents are equal", async () => {
    diffStateMock.oldContent = "# same";
    diffStateMock.newContent = "# same";

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放弃当前文件更改" }));

    expect(screen.getByText("确认放弃更改")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(screen.getByText("暂无更改内容")).toBeInTheDocument();
    });
    expect(
      within(screen.getByTestId("dialog-root")).queryByRole("status"),
    ).not.toBeInTheDocument();
  });

  it("shows an error after confirming discard when discard fails", async () => {
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放弃当前文件更改" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(discardFileChangesMock).toHaveBeenCalled();
    });
    expect(screen.getByText("放弃更改失败")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("dialog-root")).queryByRole("status"),
    ).not.toBeInTheDocument();
  });

  it("shows a no-change toast after confirming discard when discard reports no changes", async () => {
    discardFileChangesMock.mockResolvedValue({
      success: true,
      noChanges: true,
    });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放弃当前文件更改" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(discardFileChangesMock).toHaveBeenCalled();
    });
    expect(screen.getByText("暂无更改内容")).toBeInTheDocument();
    expect(
      within(screen.getByTestId("dialog-root")).queryByRole("status"),
    ).not.toBeInTheDocument();
    expect(closeDiff).not.toHaveBeenCalled();
  });

  it("forces discard when the popup is already displaying different contents", async () => {
    discardFileChangesMock.mockResolvedValue({ success: true });

    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放弃当前文件更改" }));
    fireEvent.click(screen.getByRole("button", { name: "确定" }));

    await waitFor(() => {
      expect(discardFileChangesMock).toHaveBeenCalledWith(
        "D:\\notes",
        "D:\\notes\\readme.md",
        expect.anything(),
        { skipChangeCheck: true },
      );
    });
    expect(closeDiff).toHaveBeenCalled();
  });

  it("keeps the diff popup open until the confirmed discard succeeds", async () => {
    discardFileChangesMock.mockResolvedValue({ success: true });
    const now = vi.spyOn(Date, "now").mockReturnValue(1_000);
    render(<HomePage />);

    fireEvent.click(screen.getByRole("button", { name: "放弃当前文件更改" }));
    now.mockReturnValue(1_200);
    act(() => dialogRootStateMock.onOpenChange?.(false));

    expect(closeDiff).not.toHaveBeenCalled();
    expect(screen.getByText("确认放弃更改")).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "readme.md差异" }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "确定" }));
    await waitFor(() => expect(discardFileChangesMock).toHaveBeenCalled());
    expect(closeDiff).toHaveBeenCalledTimes(1);
    now.mockRestore();
  });

  it("renders a diff toast from the shared toast event", async () => {
    diffStateMock.isOpen = false;

    render(<HomePage />);

    window.dispatchEvent(
      new CustomEvent(DIFF_TOAST_EVENT, {
        detail: { message: "暂无更改内容" },
      }),
    );

    await waitFor(() => {
      expect(screen.getByText("暂无更改内容")).toBeInTheDocument();
    });
  });

  it("renders an app toast from the shared toast event", async () => {
    diffStateMock.isOpen = false;

    render(<HomePage />);

    window.dispatchEvent(
      new CustomEvent(APP_TOAST_EVENT, {
        detail: {
          message: "“daily.md”已存在，请使用其他名称",
          variant: "error",
        },
      }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("“daily.md”已存在，请使用其他名称"),
      ).toBeInTheDocument();
    });
    expect(screen.getByRole("status")).toHaveClass(
      "app-toast",
      "top-14",
      "max-w-[320px]",
      "px-2.5",
      "py-2",
    );
    expect(screen.getByRole("status")).toHaveAttribute("data-variant", "error");
  });

  it("renders app toasts at the document root above editor surfaces", async () => {
    diffStateMock.isOpen = false;
    const container = document.createElement("div");
    document.body.append(container);

    render(<HomePage />, { container });

    window.dispatchEvent(
      new CustomEvent(APP_TOAST_EVENT, {
        detail: { message: "操作失败", variant: "error" },
      }),
    );

    const toast = await screen.findByRole("status");
    expect(toast.parentElement).toBe(document.body);
    expect(container).not.toContainElement(toast);
  });
});
