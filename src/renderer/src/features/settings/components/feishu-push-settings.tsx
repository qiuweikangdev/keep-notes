import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notification.store";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

export function FeishuPushSettings() {
  const { config, updateConfig } = useNotificationStore();
  const [webhookUrl, setWebhookUrl] = useState(config.feishu.webhookUrl);
  const [secret, setSecret] = useState(config.feishu.secret);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);

  useEffect(() => {
    setWebhookUrl(config.feishu.webhookUrl);
    setSecret(config.feishu.secret);
    setResult(null);
  }, [config.feishu.webhookUrl, config.feishu.secret]);

  /** 保存当前表单，并同步飞书推送开关状态。 */
  const save = async (enabled = config.feishu.enabled) => {
    setBusy(true);
    setResult(null);
    try {
      await updateConfig({
        feishu: {
          enabled,
          webhookUrl: webhookUrl.trim(),
          secret: secret.trim(),
        },
      });
    } catch {
      setResult({ success: false, message: "操作失败，请重试" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow
          label="飞书推送"
          description="提醒到期时通过群机器人发送飞书通知"
        >
          <Switch
            ariaLabel="飞书推送"
            checked={config.feishu.enabled}
            disabled={busy}
            onCheckedChange={(checked) => void save(checked)}
          />
        </SettingRow>
      </div>
      {config.feishu.enabled && (
        <div
          className="space-y-3 px-4 py-4"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            飞书群设置 → 群机器人 → 添加自定义机器人，复制 Webhook
            地址。如启用关键词校验，请添加 Keep Notes。
          </p>
          <div className="space-y-1.5">
            <label
              htmlFor="feishu-webhook"
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              Webhook 地址
            </label>
            <input
              id="feishu-webhook"
              type="password"
              autoComplete="off"
              value={webhookUrl}
              disabled={busy}
              onChange={(event) => {
                setWebhookUrl(event.target.value);
                setResult(null);
              }}
              placeholder="https://open.feishu.cn/open-apis/bot/v2/hook/…"
              className="h-8 w-full rounded-md px-3 text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="feishu-secret"
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              签名密钥（可选）
            </label>
            <input
              id="feishu-secret"
              type="password"
              autoComplete="off"
              value={secret}
              disabled={busy}
              onChange={(event) => {
                setSecret(event.target.value);
                setResult(null);
              }}
              placeholder="机器人开启签名校验时填写"
              className="h-8 w-full rounded-md px-3 text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
              }}
            />
          </div>
          {result && (
            <p
              role="status"
              className="text-xs"
              style={{
                color: result.success
                  ? "var(--success-color, #22c55e)"
                  : "var(--error-color, #ef4444)",
              }}
            >
              {result.message}
            </p>
          )}
          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || !webhookUrl.trim()}
              onClick={() => void save()}
              aria-busy={busy}
              className="h-8 px-3 text-xs"
            >
              保存配置
            </Button>
          </div>
        </div>
      )}
    </>
  );
}
