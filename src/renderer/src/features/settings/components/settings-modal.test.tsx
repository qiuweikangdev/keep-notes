import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SettingsModal } from "./settings-modal";
import { useUIStore } from "@/store/ui.store";

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

    fireEvent.click(checkButton);

    await waitFor(() => {
      expect(window.electronAPI.checkForUpdates).toHaveBeenCalledTimes(1);
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
});
