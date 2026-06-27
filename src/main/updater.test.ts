import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppUpdateController } from "./updater";
import type { AppUpdateState } from "../shared/types";

vi.mock("electron", () => ({
  app: {
    getVersion: () => "2.0.0",
    isPackaged: true,
  },
  shell: {
    openExternal: vi.fn(),
  },
}));

vi.mock("electron-updater", () => ({
  default: {
    autoUpdater: new EventEmitter(),
    CancellationToken: class {
      cancel(): void {}
    },
  },
}));

class FakeUpdater extends EventEmitter {
  autoDownload = true;
  autoInstallOnAppQuit = true;
  checkForUpdates = vi.fn();
  downloadUpdate = vi.fn();
  quitAndInstall = vi.fn();
}

describe("AppUpdateController", () => {
  let updater: FakeUpdater;
  let cancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    updater = new FakeUpdater();
    cancel = vi.fn();
  });

  const createController = () =>
    new AppUpdateController({
      app: {
        getVersion: () => "2.0.0",
        isPackaged: true,
      },
      updater: updater as never,
      shell: {
        openExternal: vi.fn(),
      },
      createCancellationToken: () => ({ cancel }) as never,
    });

  it("checks for updates and downloads a GitHub release with progress", async () => {
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", { version: "2.1.0" });
      return {
        isUpdateAvailable: true,
        updateInfo: { version: "2.1.0" },
      };
    });
    updater.downloadUpdate.mockReturnValue(new Promise(() => {}));
    const controller = createController();
    const states: AppUpdateState[] = [];
    controller.subscribe((state) => states.push(state));

    await controller.checkForUpdates();
    void controller.downloadUpdate();
    updater.emit("download-progress", {
      percent: 42,
      transferred: 42,
      total: 100,
      bytesPerSecond: 10,
    });

    expect(updater.autoDownload).toBe(false);
    expect(updater.downloadUpdate).toHaveBeenCalledTimes(1);
    expect(states.map((state) => state.status)).toEqual(
      expect.arrayContaining(["checking", "available", "downloading"]),
    );
    expect(controller.getState()).toMatchObject({
      status: "downloading",
      version: "2.1.0",
      progress: {
        percent: 42,
      },
    });
  });

  it("cancels an in-progress update download", async () => {
    updater.checkForUpdates.mockImplementation(async () => {
      updater.emit("update-available", { version: "2.1.0" });
      return {
        isUpdateAvailable: true,
        updateInfo: { version: "2.1.0" },
      };
    });
    updater.downloadUpdate.mockReturnValue(new Promise(() => {}));
    const controller = createController();

    await controller.checkForUpdates();
    void controller.downloadUpdate();
    const state = controller.cancelUpdate();

    expect(cancel).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({
      status: "canceled",
      version: "2.1.0",
    });
  });
});
