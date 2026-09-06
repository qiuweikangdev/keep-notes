import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_NOTIFICATION_CONFIG, type Reminder } from "../../shared/types";

const mocks = vi.hoisted(() => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  mkdir: vi.fn(),
  emailSend: vi.fn(),
  feishuSend: vi.fn(),
  feishuTest: vi.fn(),
}));
vi.mock("node:fs", () => ({
  default: {
    promises: {
      readFile: mocks.readFile,
      writeFile: mocks.writeFile,
      mkdir: mocks.mkdir,
    },
  },
}));
vi.mock("electron", () => ({ app: { getPath: () => "/test-data" } }));
vi.mock("./desktop.channel", () => ({
  DesktopChannel: class {
    updateConfig() {}
  },
}));
vi.mock("./email.channel", () => ({
  EmailChannel: class {
    updateConfig() {}
    send = mocks.emailSend;
  },
}));
vi.mock("./feishu.channel", () => ({
  FeishuChannel: class {
    updateConfig() {}
    send = mocks.feishuSend;
    test = mocks.feishuTest;
  },
}));
import { NotificationChannelManager } from "./manager";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.emailSend.mockResolvedValue(undefined);
  mocks.feishuSend.mockResolvedValue(undefined);
});

describe("NotificationChannelManager Feishu integration", () => {
  it("defaults Feishu to disabled when loading older configs", async () => {
    mocks.readFile.mockResolvedValue(
      JSON.stringify({ desktop: { enabled: false }, email: { enabled: true } }),
    );
    const manager = new NotificationChannelManager();
    const config = await manager.loadConfig();
    expect(config.feishu).toEqual(DEFAULT_NOTIFICATION_CONFIG.feishu);
    expect(config.email.enabled).toBe(true);
    await manager.sendAll({} as Reminder);
    expect(mocks.emailSend).toHaveBeenCalled();
    expect(mocks.feishuSend).not.toHaveBeenCalled();
  });

  it("persists Feishu config and returns isolated copies", async () => {
    const manager = new NotificationChannelManager();
    const config = {
      ...DEFAULT_NOTIFICATION_CONFIG,
      feishu: { enabled: true, webhookUrl: "test", secret: "" },
    };
    await manager.saveConfig(config);
    expect(JSON.parse(mocks.writeFile.mock.calls[0][1])).toEqual(config);
    manager.getConfig().feishu.enabled = false;
    expect(manager.getConfig().feishu.enabled).toBe(true);
    mocks.feishuTest.mockResolvedValue({ success: true });
    expect(await manager.testChannel("feishu")).toEqual({ success: true });
  });

  it("still sends email when Feishu fails", async () => {
    const logger = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      mocks.feishuSend.mockRejectedValueOnce(new Error("test failure"));
      const manager = new NotificationChannelManager();
      manager.updateConfig({
        ...DEFAULT_NOTIFICATION_CONFIG,
        email: { ...DEFAULT_NOTIFICATION_CONFIG.email, enabled: true },
        feishu: { ...DEFAULT_NOTIFICATION_CONFIG.feishu, enabled: true },
      });
      await expect(manager.sendAll({} as Reminder)).resolves.toBeUndefined();
      expect(mocks.emailSend).toHaveBeenCalled();
      expect(mocks.feishuSend).toHaveBeenCalled();
    } finally {
      logger.mockRestore();
    }
  });
});
