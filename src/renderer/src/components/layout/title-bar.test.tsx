import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "./title-bar";
import {
  MAC_TITLE_BAR_HEIGHT,
  MINIMAL_TITLE_BAR_HEIGHT,
} from "@shared/title-bar";

const testState = vi.hoisted(() => ({
  appearance: {
    showFileHistoryNavigation: true,
    showTitleBarQuickLauncher: false,
    defaultExternalOpenApp: "vscode",
  },
  treeRoot: null as { key: string; title: string } | null,
  selectedKey: null as string | null,
  openWithExternalApp: vi.fn(),
  setAppearance: vi.fn(),
}));

vi.mock("@/store/ui.store", () => ({
  useUIStore: () => ({
    setSettingsOpen: vi.fn(),
  }),
}));

vi.mock("@/store/editor.store", () => ({
  useEditorStore: (
    selector: (
      state: Pick<typeof testState, "appearance" | "setAppearance">,
    ) => unknown,
  ) =>
    selector({
      appearance: testState.appearance,
      setAppearance: testState.setAppearance,
    }),
}));

vi.mock("@/hooks/use-theme", () => ({
  useTheme: () => ({
    isDark: true,
    toggleTheme: vi.fn(),
  }),
}));

vi.mock("@/features/search", () => ({
  SearchModal: () => null,
}));

vi.mock("@/features/git", () => ({
  GitPanel: () => null,
}));

vi.mock("@/hooks/use-electron", () => ({
  useElectron: () => ({
    detectGitRepo: vi.fn().mockResolvedValue({
      code: "success",
      data: { isGitRepo: false },
    }),
    openFile: vi.fn(),
  }),
}));

vi.mock("@/store/tree.store", () => ({
  useTreeStore: (
    selector: (
      state: Pick<typeof testState, "treeRoot" | "selectedKey">,
    ) => unknown,
  ) =>
    selector({
      treeRoot: testState.treeRoot,
      selectedKey: testState.selectedKey,
    }),
}));

describe("TitleBar", () => {
  it("drags from compact header whitespace without dragging interactive tabs", async () => {
    render(
      <TitleBar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        compactTabs={
          <div data-testid="header-space">
            <div role="tab">note</div>
          </div>
        }
      />,
    );
    fireEvent.mouseDown(screen.getByRole("tab"), { button: 0 });
    expect(window.electronAPI.getWindowBounds).not.toHaveBeenCalled();
    const space = screen.getByTestId("header-space");
    fireEvent.mouseDown(space, { button: 0, screenX: 100, screenY: 100 });
    await waitFor(() =>
      expect(window.electronAPI.getWindowBounds).toHaveBeenCalledOnce(),
    );
    fireEvent.mouseMove(window, { screenX: 140, screenY: 125 });
    expect(window.electronAPI.moveWindow).toHaveBeenCalledWith({
      x: 40,
      y: 25,
      width: 900,
      height: 670,
    });
    fireEvent.mouseUp(window);
    fireEvent.doubleClick(space);
    expect(window.electronAPI.maximizeWindow).toHaveBeenCalledOnce();
  });
  it("merges compact tabs into the title row without search or theme toggle", () => {
    render(
      <TitleBar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        compactTabs={<div role="tablist" aria-label="编辑器标签页" />}
      />,
    );
    expect(
      within(screen.getByTestId("title-bar")).getByRole("tablist"),
    ).toBeInTheDocument();
    expect(screen.queryByText("搜索文件...")).not.toBeInTheDocument();
    expect(screen.queryByTitle("切换亮色主题")).not.toBeInTheDocument();
    expect(screen.getByTitle("设置")).toBeInTheDocument();
    expect(screen.getByTestId("title-bar")).toHaveStyle({
      height: `${MINIMAL_TITLE_BAR_HEIGHT}px`,
    });
  });

  it("hides compact-layout file history navigation until it can navigate", () => {
    const { rerender } = render(
      <TitleBar
        collapsed
        onToggleCollapse={vi.fn()}
        compactTabs={<div role="tablist" aria-label="编辑器标签页" />}
      />,
    );

    expect(screen.queryByTitle("没有历史记录")).not.toBeInTheDocument();
    expect(screen.queryByTitle("没有更多记录")).not.toBeInTheDocument();

    rerender(
      <TitleBar
        collapsed={false}
        onToggleCollapse={vi.fn()}
        compactTabs={<div role="tablist" aria-label="编辑器标签页" />}
      />,
    );

    expect(screen.queryByTitle("没有历史记录")).not.toBeInTheDocument();
    expect(screen.queryByTitle("没有更多记录")).not.toBeInTheDocument();

    act(() => {
      window.__addFileToHistory?.("first.md");
    });
    expect(screen.queryByTitle("没有历史记录")).not.toBeInTheDocument();

    act(() => {
      window.__addFileToHistory?.("second.md");
    });
    expect(screen.getByTitle("返回上一个文件")).toBeInTheDocument();
    expect(screen.getByTitle("没有更多记录")).toBeInTheDocument();
  });

  it("removes the collapsed compact navigation spacer after hiding history controls", () => {
    render(
      <TitleBar
        collapsed
        onToggleCollapse={vi.fn()}
        compactTabs={<div role="tablist" aria-label="编辑器标签页" />}
      />,
    );

    const navigation = screen
      .getByTestId("title-bar")
      .querySelector(".workspace-title-navigation");

    expect(navigation).toBeInTheDocument();
    expect(navigation).toHaveStyle({ width: "auto" });
    expect(navigation).toHaveStyle({ paddingRight: "8px" });
    expect(navigation?.getAttribute("style")).not.toMatch(
      /min-width:\s*(190px|112px)/,
    );
  });
  afterEach(cleanup);
  beforeEach(() => {
    testState.appearance = {
      showFileHistoryNavigation: true,
      showTitleBarQuickLauncher: false,
      defaultExternalOpenApp: "vscode",
    };
    testState.treeRoot = null;
    testState.selectedKey = null;
    testState.openWithExternalApp.mockReset();
    testState.setAppearance.mockReset();

    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
        getWindowBounds: vi
          .fn()
          .mockResolvedValue({ x: 0, y: 0, width: 900, height: 670 }),
        moveWindow: vi.fn(),
        maximizeWindow: vi.fn(),
        listExternalOpenApps: vi.fn().mockResolvedValue([]),
        openWithExternalApp: testState.openWithExternalApp,
      },
    });
  });

  it("在 macOS 下保持统一的标题栏高度，并让左侧原生按钮占位撑满整行", () => {
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: {
        getPlatform: () => "darwin",
      },
    });

    render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />);

    expect(screen.getByTestId("title-bar")).toHaveStyle({
      height: `${MAC_TITLE_BAR_HEIGHT}px`,
    });
    expect(screen.getByTestId("mac-traffic-light-spacer")).toHaveClass(
      "h-full",
    );
  });

  it("拖动标题栏时保持拖动开始时的窗口尺寸", async () => {
    const getWindowBounds = vi.fn().mockResolvedValue({
      x: 100,
      y: 200,
      width: 900,
      height: 670,
    });
    const moveWindow = vi.fn();
    Object.assign(window.electronAPI, { getWindowBounds, moveWindow });

    render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />);

    const titleBar = screen.getByTestId("title-bar");
    fireEvent.mouseDown(titleBar, {
      button: 0,
      screenX: 300,
      screenY: 400,
    });
    await waitFor(() => expect(getWindowBounds).toHaveBeenCalledOnce());
    fireEvent.mouseMove(window, { screenX: 320, screenY: 430 });

    expect(moveWindow).toHaveBeenCalledWith({
      x: 120,
      y: 230,
      width: 900,
      height: 670,
    });
  });

  it("标题栏应用打开器始终使用当前目录打开外部应用", async () => {
    testState.appearance = {
      ...testState.appearance,
      showTitleBarQuickLauncher: true,
    };
    testState.treeRoot = { key: "D:\\notes\\work", title: "work" };
    testState.selectedKey = "D:\\notes\\work\\daily.md";
    window.electronAPI.listExternalOpenApps = vi
      .fn()
      .mockResolvedValue([
        { id: "vscode", label: "VS Code", kind: "editor", available: true },
      ]);

    render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />);

    const openButton = await screen.findByLabelText("使用 VS Code 打开");
    fireEvent.click(openButton);

    await waitFor(() => {
      expect(testState.openWithExternalApp).toHaveBeenCalledWith(
        "D:\\notes\\work",
        "vscode",
      );
    });
  });

  it("从标题栏搜索入口派发全局搜索事件", () => {
    const listener = vi.fn();
    window.addEventListener("open-search", listener);

    try {
      const container = document.createElement("div");
      render(<TitleBar collapsed={false} onToggleCollapse={vi.fn()} />, {
        container,
      });
      fireEvent.click(
        within(container).getByRole("button", { name: /搜索文件/ }),
      );

      expect(listener).toHaveBeenCalledOnce();
    } finally {
      window.removeEventListener("open-search", listener);
    }
  });
});
