import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TitleBar } from "./title-bar";
import { MAC_TITLE_BAR_HEIGHT } from "@shared/title-bar";

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
  useEditorStore: () => ({
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
  useTreeStore: () => ({
    treeRoot: testState.treeRoot,
    selectedKey: testState.selectedKey,
  }),
}));

describe("TitleBar", () => {
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
        getWindowPosition: vi.fn().mockResolvedValue([0, 0]),
        setWindowPosition: vi.fn(),
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
