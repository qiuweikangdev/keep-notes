import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FeishuChannel } from "./feishu.channel";
import type { Reminder } from "../../shared/types";

const config = {
  enabled: true,
  webhookUrl: "https://open.feishu.cn/open-apis/bot/v2/hook/test-bot",
  secret: "",
};
const reminder: Reminder = {
  id: "test",
  title: "测试提醒",
  fileName: "note.md",
  filePath: "/private/note.md",
  scheduledAt: "2026-09-07T09:00:00Z",
  repeat: "never",
  completed: false,
  createdAt: "",
  updatedAt: "",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("FeishuChannel", () => {
  it("sends reminder content without a local path or unnecessary signature", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    await new FeishuChannel(config).send(reminder);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.msg_type).toBe("text");
    expect(body.content.text).toContain("测试提醒");
    expect(body.content.text).toContain("note.md");
    expect(body.content.text).not.toContain("/private/");
    expect(body.sign).toBeUndefined();
  });

  it("signs tests with the latest config even when disabled", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-07T09:00:00Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ code: 0 })));
    vi.stubGlobal("fetch", fetchMock);
    const channel = new FeishuChannel(config);
    channel.updateConfig({ ...config, enabled: false, secret: "test-secret" });
    await expect(channel.test()).resolves.toEqual({ success: true });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.timestamp).toBe(String(Date.now() / 1000));
    expect(body.sign).toBe(
      createHmac("sha256", `${body.timestamp}\ntest-secret`).digest("base64"),
    );
  });

  it("does not send disabled reminders or invalid endpoints", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await new FeishuChannel({ ...config, enabled: false }).send(reminder);
    for (const webhookUrl of [
      "",
      "http://open.feishu.cn/open-apis/bot/v2/hook/test",
      "https://example.com/hook",
      `${config.webhookUrl}?token=test`,
    ]) {
      expect(
        (await new FeishuChannel({ ...config, webhookUrl }).test()).success,
      ).toBe(false);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [new Response(JSON.stringify({ code: 19021 })), "19021"],
    [new Response("error", { status: 503 }), "503"],
    [new Response("invalid"), "无效响应"],
    [new Response("{}"), "无效响应"],
  ])(
    "reports HTTP, API and malformed response errors",
    async (response, message) => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      expect(await new FeishuChannel(config).test()).toEqual({
        success: false,
        error: expect.stringContaining(message),
      });
    },
  );

  it("does not expose credentials from network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error(config.webhookUrl)),
    );
    const result = await new FeishuChannel(config).test();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain(config.webhookUrl);
  });
});
