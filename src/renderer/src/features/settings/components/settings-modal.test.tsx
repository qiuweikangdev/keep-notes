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
import { SettingsModal } from "./settings-modal";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { useExportStore } from "@/store/export.store";
import { DEFAULT_EXPORT_CONFIG } from "@/types";

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

describe("SettingsModal about tab", () => {
  const electronAPI = {
    getPlatform: () => "darwin",
    getAppInfo: vi.fn(async () => ({
      version: "2.0.0",
      repositoryUrl: "https://github.com/qiuweikangdev/keep-notes",
      author: "qiuweikangdev",
    })),
    getUpdateState: vi.fn(async () => ({
      status: "idle",
      currentVersion: "2.0.0",
    })),
    checkForUpdates: vi.fn(async () => ({
      status: "checking",
      currentVersion: "2.0.0",
    })),
    cancelUpdate: vi.fn(async () => ({
      status: "canceled",
      currentVersion: "2.0.0",
      version: "2.1.0",
    })),
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

  it("keeps the dialog inside small application windows", () => {
    render(<SettingsModal />);

    expect(screen.getByRole("dialog")).toHaveClass(
      "flex",
      "h-[min(640px,calc(100vh-32px))]",
      "max-h-none",
      "w-[min(780px,calc(100vw-32px))]",
      "max-w-none",
      "flex-col",
    );
    expect(screen.getByTestId("settings-layout")).toHaveClass(
      "min-h-0",
      "flex-1",
    );
    expect(screen.getByTestId("settings-navigation")).toHaveClass(
      "w-[180px]",
      "sm:w-[220px]",
      "overflow-y-auto",
    );
    expect(screen.getByTestId("settings-content")).toHaveClass(
      "min-w-0",
      "overflow-y-auto",
    );
  });

  it("uses the shared drag handle and all resize handles", () => {
    render(<SettingsModal />);

    expect(document.querySelector("[data-dialog-drag-handle]")).not.toBeNull();
    expect(
      document.querySelectorAll("[data-dialog-resize-handle]"),
    ).toHaveLength(8);
  });

  it("restores default geometry after closing and reopening", async () => {
    render(<SettingsModal />);

    const dialog = screen.getByRole("dialog");
    dialog.style.width = "600px";
    dialog.style.height = "420px";
    dialog.style.left = "24px";
    dialog.style.top = "30px";
    dialog.style.transform = "none";

    act(() => useUIStore.getState().setSettingsOpen(false));
    act(() => useUIStore.getState().setSettingsOpen(true));

    await waitFor(() => {
      const reopenedDialog = screen.getByRole("dialog");
      expect(reopenedDialog.style.width).toBe("");
      expect(reopenedDialog.style.height).toBe("");
      expect(reopenedDialog.style.left).toBe("");
      expect(reopenedDialog.style.top).toBe("");
      expect(reopenedDialog.style.transform).toBe("");
    });
  });

  it("shows app metadata and triggers update checks from the about tab", async () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));

    await waitFor(() => {
      expect(screen.getByText("Keep Notes")).toBeInTheDocument();
    });
    expect(screen.getByText("当前版本")).toBeInTheDocument();
    expect(screen.getByText("qiuweikangdev/keep-notes")).toBeInTheDocument();
    expect(screen.getByText("qiuweikangdev")).toBeInTheDocument();
    expect(
      screen.queryByText("https://github.com/qiuweikangdev/keep-notes"),
    ).not.toBeInTheDocument();
    expect(
      screen.getByTitle("https://github.com/qiuweikangdev/keep-notes"),
    ).toBeInTheDocument();

    const checkButton = screen.getByRole("button", { name: /检查更新/ });
    expect(checkButton.getAttribute("style")).toContain(
      "background-color: transparent",
    );

    await waitFor(() => {
      expect(window.electronAPI.checkForUpdates).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(window.electronAPI.checkForUpdates).toHaveBeenCalledTimes(2);
    });
  });

  it("keeps the current version visible beside the update action", async () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /关于/ }));

    await waitFor(() => {
      expect(screen.getByText("v2.0.0")).toBeInTheDocument();
    });
  });

  it("renames the notification settings menu item to app notification config", () => {
    render(<SettingsModal />);

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
    render(<SettingsModal />);

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

    render(<SettingsModal />);

    const [uiFontSizeInput] = screen.getAllByRole("spinbutton");
    fireEvent.change(uiFontSizeInput, { target: { value: "18" } });

    expect(setAppearance).toHaveBeenCalledWith({
      fontSize: 18,
      uiFontSize: 18,
    });
  });

  it("updates the window zoom factor from the appearance slider", async () => {
    render(<SettingsModal />);

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
    render(<SettingsModal />);

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
    render(<SettingsModal />);

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
    render(<SettingsModal />);

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
