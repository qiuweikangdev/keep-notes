import type { PropsWithChildren } from "react";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useTreeStore } from "@/store/tree.store";
import { DIFF_TOAST_EVENT } from "@/features/diff/lib/diff-toast";
import { APP_TOAST_EVENT } from "@/lib/app-toast";

const closeDiff = vi.fn();
const discardFileChangesMock = vi.hoisted(() => vi.fn());
const diffStateMock = vi.hoisted(() => ({
  isOpen: true,
  source: "worktree" as "worktree" | "history",
  oldContent: "# old",
  newContent: "# new",
}));

vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelResizeHandle: () => <div />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: {
    Root: ({ children, open }: PropsWithChildren<{ open?: boolean }>) =>
      open ? <div data-testid="dialog-root">{children}</div> : null,
    Title: ({ children }: PropsWithChildren) => <h2>{children}</h2>,
  },
  DialogContent: ({ children }: PropsWithChildren) => <div>{children}</div>,
  DialogHeader: ({ children }: PropsWithChildren) => <div>{children}</div>,
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

describe("HomePage", () => {
  beforeEach(() => {
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

  it("shows a no-change toast after confirming discard when discard has no content to update", async () => {
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
});
