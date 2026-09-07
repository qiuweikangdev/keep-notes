import {
  act,
  cleanup,
  fireEvent,
  render as baseRender,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DragResizeProvider } from "@/components/drag-resize-provider";
import { SettingsPage } from "./settings-page";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { useExportStore } from "@/store/export.store";
import { DEFAULT_EXPORT_CONFIG } from "@/types";
import { MAC_TRAFFIC_LIGHT_PLACEHOLDER_WIDTH } from "@shared/title-bar";

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

describe("SettingsPage about tab", () => {
  const electronAPI = {
    getPlatform: () => "darwin",
    getAppInfo: vi.fn(async () => ({
      version: "2.0.0",
      repositoryUrl: "https://github.com/qiuweikangdev/keep-notes",
      author: "qiuweikangdev",
    })),
    getUpdateState: vi.fn(
      async (): Promise<import("@shared/types").AppUpdateState> => ({
        status: "idle",
        currentVersion: "2.0.0",
      }),
    ),
    checkForUpdates: vi.fn(
      async (): Promise<import("@shared/types").AppUpdateState> => ({
        status: "checking",
        currentVersion: "2.0.0",
      }),
    ),
    cancelUpdate: vi.fn(
      async (): Promise<import("@shared/types").AppUpdateState> => ({
        status: "canceled",
        currentVersion: "2.0.0",
        version: "2.1.0",
      }),
    ),
    installUpdate: vi.fn(),
    openRepository: vi.fn(),
    onUpdateState: vi.fn(() => vi.fn()),
    getZoomFactor: vi.fn(async () => 1),
    setZoomFactor: vi.fn(async (zoomFactor: number) => zoomFactor),
    getExportConfig: vi.fn(async () => ({
      enabledFormats: ["pdf"],
      defaultDirectoryMode: "same-as-source",
      customDirectoryPath: "/Users/test/Downloads",
      openDirectoryAfterExport: false,
    })),
    setExportConfig: vi.fn(async () => undefined),
    onExportConfigChanged: vi.fn(() => vi.fn()),
    getSelectedPath: vi.fn(async () => "/Users/test/Documents"),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    window.matchMedia = vi.fn().mockReturnValue({
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matches: false,
    });
    Object.defineProperty(window, "electronAPI", {
      configurable: true,
      value: electronAPI,
    });
    useUIStore.setState({ isSettingsOpen: true });
    useExportStore.setState({
      config: DEFAULT_EXPORT_CONFIG,
      isLoading: false,
    });
  });

  afterEach(() => {
    cleanup();
    document.body.removeAttribute("data-scroll-locked");
    document.body.style.pointerEvents = "";
  });

  it("renders a full settings page with one title and a back entry", () => {
    render(<SettingsPage />);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-page-title")).toHaveTextContent("外观");
    expect(
      screen.queryByRole("heading", { name: "外观" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("settings-content")).toHaveClass(
      "overflow-y-auto",
    );
    expect(screen.getByRole("button", { name: "返回" })).toBeInTheDocument();
  });

  it("toggles the settings navigation from the top-left button", () => {
    render(<SettingsPage />);

    const sidebar = screen.getByTestId("settings-sidebar");
    const toggleButton = screen.getByRole("button", { name: "收起设置侧栏" });
    const contentHeader = screen.getByTestId("settings-content-header");

    expect(toggleButton).toHaveClass("top-1.5");
    expect(toggleButton).toHaveStyle({
      left: `${MAC_TRAFFIC_LIGHT_PLACEHOLDER_WIDTH + 12}px`,
    });
    expect(contentHeader).toHaveStyle({ paddingLeft: "24px" });
    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(toggleButton).toHaveAccessibleName("收起设置侧栏");

    fireEvent.click(toggleButton);

    expect(sidebar).toHaveAttribute("data-collapsed", "true");
    expect(sidebar).toHaveClass("settings-sidebar--collapsed");
    expect(contentHeader).toHaveStyle({
      paddingLeft: `${MAC_TRAFFIC_LIGHT_PLACEHOLDER_WIDTH + 12 + 32 + 12}px`,
    });
    expect(toggleButton).toHaveAccessibleName("展开设置侧栏");

    fireEvent.click(toggleButton);

    expect(sidebar).toHaveAttribute("data-collapsed", "false");
    expect(toggleButton).toHaveAccessibleName("收起设置侧栏");
  });

  it("navigates to settings and returns to the workspace", () => {
    act(() => useUIStore.getState().setSettingsOpen(true));
    render(<SettingsPage />);
    expect(window.location.hash).toBe("#/settings");
    fireEvent.click(screen.getByRole("button", { name: "返回" }));
    expect(window.location.hash).toBe("#/");
    expect(useUIStore.getState().isSettingsOpen).toBe(false);
    expect(
      screen.queryByRole("navigation", { name: "设置分类" }),
    ).not.toBeInTheDocument();
  });

  it("uses semantic selected navigation and a primary content surface", () => {
    render(<SettingsPage />);

    const appearanceButton = screen.getByRole("button", { name: /外观/ });
    const aboutButton = screen.getByRole("button", { name: /关于/ });

    expect(appearanceButton).toHaveAttribute("aria-current", "page");
    expect(appearanceButton).toHaveAttribute("data-selected", "true");
    expect(appearanceButton).toHaveAttribute(
      "data-selection-context",
      "secondary",
    );
    expect(appearanceButton).toHaveStyle({
      backgroundColor: "var(--file-tree-row-selected)",
      color: "var(--accent-color)",
    });
    expect(screen.getByTestId("settings-content")).toHaveStyle({
      backgroundColor: "var(--bg-primary)",
    });

    fireEvent.click(aboutButton);

    expect(appearanceButton).not.toHaveAttribute("aria-current");
    expect(appearanceButton).not.toHaveAttribute("data-selected");
    expect(aboutButton).toHaveAttribute("aria-current", "page");
    expect(aboutButton).toHaveAttribute("data-selected", "true");
  });

  it("uses the shared setting-row typography for appearance labels", () => {
    render(<SettingsPage />);

    const themeLabel = screen.getByText("主题");
    const defaultOpenTargetLabel = screen.getByText("默认打开目标");

    expect(themeLabel).toHaveClass("text-sm");
    expect(themeLabel).not.toHaveClass("font-medium");
    expect(themeLabel).toHaveStyle({ color: "var(--text-primary)" });
    expect(defaultOpenTargetLabel).toHaveStyle({
      color: "var(--text-primary)",
    });
  });

  it("shows app metadata and triggers update checks from the about tab", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));

    await waitFor(() => {
      expect(screen.getByText("Keep Notes")).toBeInTheDocument();
    });
    expect(screen.getByText("当前版本")).toBeInTheDocument();
    expect(screen.getByText("qiuweikangdev/keep-notes")).toBeInTheDocument();
    expect(screen.getByText("qiuweikangdev")).toBeInTheDocument();
    expect(screen.getByTestId("about-app-card")).toHaveAttribute(
      "style",
      expect.stringContaining("background-color: var(--bg-primary)"),
    );
    expect(screen.getByTestId("about-project-card")).toHaveAttribute(
      "style",
      expect.stringContaining("background-color: var(--bg-primary)"),
    );
    expect(
      screen.queryByText("https://github.com/qiuweikangdev/keep-notes"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTitle("https://github.com/qiuweikangdev/keep-notes"),
    ).toBeInTheDocument();

    const checkButton = screen.getByRole("button", { name: /检查更新/ });
    expect(checkButton).toHaveAttribute("data-ui-button", "true");
    expect(checkButton).toHaveAttribute("data-variant", "outline");

    await waitFor(() => {
      expect(window.electronAPI.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(window.electronAPI.checkForUpdates).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps the current version visible beside the update action", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));

    await waitFor(() => {
      expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    });
  });

  it("does not reserve an empty status row when an update is available", async () => {
    electronAPI.getUpdateState.mockResolvedValueOnce({
      status: "available",
      currentVersion: "2.0.0",
      version: "2.1.0",
    });
    electronAPI.checkForUpdates.mockResolvedValueOnce({
      status: "available",
      currentVersion: "2.0.0",
      version: "2.1.0",
    });

    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));

    const updateButton = await screen.findByRole("button", {
      name: "更新到 v2.1.0",
    });
    expect(updateButton).toHaveAttribute("data-ui-button", "true");
    expect(
      screen.getByTestId("about-app-card").querySelector("div.border-t"),
    ).not.toBeInTheDocument();
  });

  it("renames the notification settings menu item to app notification config", () => {
    render(<SettingsPage />);

    expect(
      screen.getByRole("button", { name: /应用通知配置/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /通知推送/ }),
    ).toBeInTheDocument();
  });

  it("shows an icon-only cancel button while an update is downloading", async () => {
    electronAPI.getUpdateState.mockResolvedValueOnce({
      status: "downloading",
      currentVersion: "2.0.0",
      version: "2.1.0",
      progress: {
        percent: 35,
        transferred: 35,
        total: 100,
        bytesPerSecond: 10,
      },
    });
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));
    const cancelButton = await screen.findByRole("button", {
      name: "取消更新",
    });
    fireEvent.click(cancelButton);

    await waitFor(() => {
      expect(window.electronAPI.cancelUpdate).toHaveBeenCalledTimes(1);
    });
  });

  it("keeps Markdown editor font size in sync when changing UI font size", () => {
    const setAppearance = vi.fn();
    useEditorStore.setState({
      appearance: {
        ...useEditorStore.getState().appearance,
        fontSize: 16,
        uiFontSize: 13,
      },
      setAppearance,
    });

    render(<SettingsPage />);

    const [uiFontSizeInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(uiFontSizeInput, { target: { value: "18" } });

    expect(setAppearance).toHaveBeenCalledWith({
      fontSize: 18,
      uiFontSize: 18,
    });
  });

  it("updates the window zoom factor from the appearance slider", async () => {
    render(<SettingsPage />);

    const zoomSlider = screen.getByRole("slider", { name: "界面缩放" });
    await waitFor(() => {
      expect(zoomSlider).toBeEnabled();
    });
    expect(zoomSlider).toHaveAttribute("min", "0.5");
    expect(zoomSlider).toHaveAttribute("max", "1.5");
    fireEvent.change(zoomSlider, { target: { value: "1.2" } });

    await waitFor(() => {
      expect(window.electronAPI.setZoomFactor).toHaveBeenCalledWith(1.2);
    });
    expect(zoomSlider).toHaveAttribute("aria-valuetext", "120%");
  });

  it("uses one divider for each appearance setting row", () => {
    render(<SettingsPage />);

    const settingRow = screen
      .getByText("应用打开器入口")
      .closest("div[style*='border-bottom']");

    expect(settingRow).toHaveAttribute(
      "style",
      expect.stringContaining("border-bottom"),
    );
    expect(settingRow?.parentElement).not.toHaveAttribute(
      "style",
      expect.stringContaining("border-bottom"),
    );
  });

  it("configures export formats from the export tab", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /导出/ }));

    expect(await screen.findByText("导出格式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出格式" })).toHaveTextContent(
      "PDF",
    );
    expect(screen.getByTestId("export-format-row")).toHaveClass(
      "grid-cols-[180px_1fr]",
    );
    expect(screen.getByTestId("export-directory-row")).toHaveClass(
      "grid-cols-[180px_1fr]",
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "导出格式" }), {
      key: "Enter",
    });
    expect(
      await screen.findByRole("menu", { name: "导出格式" }),
    ).toHaveAttribute("data-export-settings-dropdown");
    expect(
      await screen.findByRole("menuitemcheckbox", { name: "PDF" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Word" }));

    await waitFor(() => {
      expect(window.electronAPI.setExportConfig).toHaveBeenLastCalledWith({
        enabledFormats: ["pdf", "word"],
        defaultDirectoryMode: "same-as-source",
        customDirectoryPath: "/Users/test/Downloads",
        openDirectoryAfterExport: false,
      });
    });
  });

  it("configures export folder and post-export behavior from the export tab", async () => {
    render(<SettingsPage />);

    fireEvent.click(screen.getByRole("button", { name: /导出/ }));
    expect(await screen.findByText("导出格式")).toBeInTheDocument();

    fireEvent.keyDown(
      screen.getByRole("button", { name: "默认的导出文件夹" }),
      { key: "Enter" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "自定义" }));
    expect(await screen.findByPlaceholderText("请选择导出文件夹")).toHaveValue(
      "/Users/test/Downloads",
    );
    fireEvent.click(
      screen.getByRole("button", { name: "选择自定义导出文件夹" }),
    );
    fireEvent.click(
      screen.getByRole("switch", { name: "打开导出文件所在目录" }),
    );

    await waitFor(() => {
      expect(window.electronAPI.setExportConfig).toHaveBeenLastCalledWith({
        enabledFormats: ["pdf"],
        defaultDirectoryMode: "custom",
        customDirectoryPath: "/Users/test/Documents",
        openDirectoryAfterExport: true,
      });
    });
  });
});
