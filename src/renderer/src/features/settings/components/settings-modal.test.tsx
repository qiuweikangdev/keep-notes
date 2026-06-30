import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./settings-modal";
import { useEditorStore } from "@/store/editor.store";
import { useUIStore } from "@/store/ui.store";
import { useExportStore } from "@/store/export.store";
import { DEFAULT_EXPORT_CONFIG } from "@/types";

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
    getExportConfig: vi.fn(async () => ({
      enabledFormats: ["pdf"],
      defaultDirectoryMode: "same-as-source",
      customDirectoryPath: "",
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

  it("configures export folder and post-export behavior from the export tab", async () => {
    render(<SettingsModal />);

    fireEvent.click(screen.getByRole("button", { name: /导出/ }));

    expect(await screen.findByText("导出格式")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "导出格式" })).toHaveTextContent(
      "PDF",
    );

    fireEvent.keyDown(screen.getByRole("button", { name: "导出格式" }), {
      key: "Enter",
    });
    expect(
      await screen.findByRole("menuitemcheckbox", { name: "PDF" }),
    ).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("menuitemcheckbox", { name: "Word" }));
    fireEvent.keyDown(screen.getByRole("menu", { name: "导出格式" }), {
      key: "Escape",
    });

    fireEvent.keyDown(
      screen.getByRole("button", { name: "默认的导出文件夹" }),
      { key: "Enter" },
    );
    fireEvent.click(await screen.findByRole("menuitem", { name: "自定义" }));
    fireEvent.click(
      screen.getByRole("button", { name: "选择自定义导出文件夹" }),
    );
    fireEvent.click(screen.getByLabelText("打开导出文件所在目录"));

    await waitFor(() => {
      expect(window.electronAPI.setExportConfig).toHaveBeenLastCalledWith({
        enabledFormats: ["pdf", "word"],
        defaultDirectoryMode: "custom",
        customDirectoryPath: "/Users/test/Documents",
        openDirectoryAfterExport: true,
      });
    });
  });
});
