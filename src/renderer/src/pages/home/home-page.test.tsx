import type { PropsWithChildren } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const closeDiff = vi.fn();
const diffStateMock = vi.hoisted(() => ({
  source: "worktree" as "worktree" | "history",
}));

vi.mock("react-resizable-panels", () => ({
  Panel: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelGroup: ({ children }: PropsWithChildren) => <div>{children}</div>,
  PanelResizeHandle: () => <div />,
}));

vi.mock("@/components/ui/dialog", () => ({
  Dialog: {
    Root: ({ children }: PropsWithChildren) => (
      <div data-testid="dialog-root">{children}</div>
    ),
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
  ConfirmDialog: () => null,
}));

vi.mock("@/store/diff.store", () => ({
  useDiffStore: () => ({
    isOpen: true,
    isLoading: false,
    oldContent: "# old",
    newContent: "# new",
    filePath: "D:\\notes\\readme.md",
    source: diffStateMock.source,
    closeDiff,
  }),
}));

import { HomePage } from "./home-page";

describe("HomePage", () => {
  beforeEach(() => {
    diffStateMock.source = "worktree";
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "win32",
        consumeWindowOpenTarget: () => null,
        onWindowOpenTarget: () => () => undefined,
      },
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
});
