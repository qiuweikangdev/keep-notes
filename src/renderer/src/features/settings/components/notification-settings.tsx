import { useEffect, useState } from "react";
import { useNotificationStore } from "@/store/notification.store";
import { SettingRow } from "@/components/ui/setting-row";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

/** QQ 邮箱 SMTP 固定配置 */
const QQ_MAIL_SMTP_HOST = "smtp.qq.com";
const QQ_MAIL_SMTP_PORT = 465;

export function NotificationSettings() {
  const { config, loadConfig, updateConfig, testChannel, subscribeToChanges } =
    useNotificationStore();

  const [email, setEmail] = useState(config.email.senderEmail);
  const [code, setCode] = useState(config.email.authorizationCode);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    error?: string;
  } | null>(null);

  useEffect(() => {
    void loadConfig();
    const unsubscribe = subscribeToChanges();
    return unsubscribe;
  }, [loadConfig, subscribeToChanges]);

  // 配置变更时同步本地状态
  useEffect(() => {
    setEmail(config.email.senderEmail);
    setCode(config.email.authorizationCode);
  }, [config.email.senderEmail, config.email.authorizationCode]);

  /** 切换邮箱推送开关 */
  const handleToggleEmail = async (checked: boolean) => {
    if (checked) {
      // 开启时保存配置
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
    setTestResult(null);
  };

  /** 测试 SMTP 连接 */
  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);
    try {
      const result = await testChannel("email");
      setTestResult(result);
    } finally {
      setIsTesting(false);
    }
  };

  /** 保存邮箱配置 */
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
    setTestResult(null);
  };

  const isValid = email && code;

  return (
    <div className="space-y-0">
      {/* 桌面通知 */}
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="桌面通知" description="提醒到期时显示系统桌面通知">
          <Switch
            checked={config.desktop.enabled}
            onCheckedChange={(checked) =>
              updateConfig({ desktop: { enabled: checked } })
            }
          />
        </SettingRow>
      </div>

      {/* 邮箱推送开关 */}
      <div style={{ borderBottom: "1px solid var(--border-color)" }}>
        <SettingRow label="QQ 邮箱推送" description="提醒到期时发送邮件通知">
          <Switch
            checked={config.email.enabled}
            onCheckedChange={handleToggleEmail}
          />
        </SettingRow>
      </div>

      {/* 邮箱配置 - 仅在开启时显示 */}
      {config.email.enabled && (
        <div
          className="px-4 py-4 space-y-3"
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
              className="w-full h-8 px-3 text-sm rounded-md"
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
              className="w-full h-8 px-3 text-sm rounded-md"
              style={{
                backgroundColor: "var(--bg-tertiary)",
                border: "1px solid var(--border-color)",
                color: "var(--text-primary)",
                outline: "none",
              }}
            />
          </div>

          {/* 测试结果 */}
          {testResult && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-md text-xs"
              style={{
                backgroundColor: testResult.success
                  ? "rgba(34, 197, 94, 0.1)"
                  : "rgba(239, 68, 68, 0.1)",
                border: `1px solid ${testResult.success ? "rgba(34, 197, 94, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
              }}
            >
              {testResult.success ? (
                <>
                  <CheckCircle2
                    className="h-3.5 w-3.5 flex-shrink-0"
                    style={{ color: "var(--success-color, #22c55e)" }}
                  />
                  <span style={{ color: "var(--success-color, #22c55e)" }}>
                    连接成功
                  </span>
                </>
              ) : (
                <>
                  <XCircle
                    className="h-3.5 w-3.5 flex-shrink-0"
                    style={{ color: "var(--error-color, #ef4444)" }}
                  />
                  <span style={{ color: "var(--error-color, #ef4444)" }}>
                    {testResult.error || "连接失败"}
                  </span>
                </>
              )}
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex items-center gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={isTesting || !isValid}
              className="h-7 gap-1.5 px-2.5 text-xs"
            >
              {isTesting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                "测试连接"
              )}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleSave}
              disabled={!isValid}
              className="h-7 px-2.5 text-xs"
            >
              保存配置
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
