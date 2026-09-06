import { useEffect, useState } from "react";
import { FeishuPushSettings } from "./feishu-push-settings";
import { useNotificationStore } from "@/store/notification.store";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";

/** QQ 邮箱 SMTP 固定配置 */
const QQ_MAIL_SMTP_HOST = "smtp.qq.com";
const QQ_MAIL_SMTP_PORT = 465;

export function NotificationPushSettings() {
  const { config, loadConfig, updateConfig, subscribeToChanges } =
    useNotificationStore();

  const [email, setEmail] = useState(config.email.senderEmail);
  const [code, setCode] = useState(config.email.authorizationCode);

  useEffect(() => {
    void loadConfig();
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadConfig, subscribeToChanges]);

  // 配置变更时同步邮箱表单，避免外部 IPC 更新后页面仍显示旧值。
  useEffect(() => {
    setEmail(config.email.senderEmail);
    setCode(config.email.authorizationCode);
  }, [config.email.authorizationCode, config.email.senderEmail]);

  /** 切换邮箱推送开关，开启时一并保存 QQ 邮箱 SMTP 固定参数。 */
  const handleToggleEmail = async (checked: boolean) => {
    if (checked) {
      await updateConfig({
        email: {
          enabled: true,
          smtpHost: QQ_MAIL_SMTP_HOST,
          smtpPort: QQ_MAIL_SMTP_PORT,
          senderEmail: email,
          authorizationCode: code,
          receiverEmail: email,
        },
      });
    } else {
      await updateConfig({ email: { ...config.email, enabled: false } });
    }
  };

  /** 保存邮箱推送配置，收件人默认使用同一个 QQ 邮箱。 */
  const handleSave = async () => {
    await updateConfig({
      email: {
        enabled: true,
        smtpHost: QQ_MAIL_SMTP_HOST,
        smtpPort: QQ_MAIL_SMTP_PORT,
        senderEmail: email,
        authorizationCode: code,
        receiverEmail: email,
      },
    });
  };

  const isValid = email && code;

  return (
    <div className="space-y-0">
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="QQ 邮箱推送" description="提醒到期时发送邮件通知">
          <Switch
            ariaLabel="QQ 邮箱推送"
            checked={config.email.enabled}
            onCheckedChange={handleToggleEmail}
          />
        </SettingRow>
      </div>

      {config.email.enabled && (
        <div
          className="space-y-3 px-4 py-4"
          style={{ borderBottom: "1px solid var(--border-color)" }}
        >
          <div className="space-y-1.5">
            <label
              className="text-xs font-medium"
              style={{ color: "var(--text-muted)" }}
            >
              QQ 邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your-email@qq.com"
              className="h-8 w-full rounded-md px-3 text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label
                className="text-xs font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                授权码
              </label>
              <span
                className="text-xs"
                style={{ color: "var(--text-muted)", opacity: 0.7 }}
              >
                QQ邮箱 → 设置 → 账户 → 生成授权码
              </span>
            </div>
            <input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="16位授权码"
              className="h-8 w-full rounded-md px-3 text-sm"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!isValid}
              className="h-8 px-3 text-xs"
            >
              保存配置
            </Button>
          </div>
        </div>
      )}
      <FeishuPushSettings />
    </div>
  );
}
