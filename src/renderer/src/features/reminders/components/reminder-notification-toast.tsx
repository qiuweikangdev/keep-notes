import { useEffect } from "react";
import { Bell, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useElectron } from "@/hooks/use-electron";
import { useReminderStore } from "@/store/reminder.store";
import { formatReminderDateTime } from "../lib/reminder-format";

const AUTO_CLOSE_DELAY = 12_000;

export function ReminderNotificationToast() {
  const reminder = useReminderStore((state) => state.triggeredReminder);
  const closeTriggeredReminder = useReminderStore(
    (state) => state.closeTriggeredReminder,
  );
  const { openFile } = useElectron();

  useEffect(() => {
    if (!reminder) return;

    // 应用内提醒作为系统桌面通知的兜底，避免系统权限拦截后用户完全无感知。
    const timer = window.setTimeout(closeTriggeredReminder, AUTO_CLOSE_DELAY);
    return () => window.clearTimeout(timer);
  }, [closeTriggeredReminder, reminder]);

  if (!reminder) return null;

  const detail = [
    reminder.fileName,
    formatReminderDateTime(reminder.scheduledAt),
  ]
    .filter(Boolean)
    .join(" · ");

  const handleOpen = async () => {
    if (!reminder.filePath) return;
    await openFile(reminder.filePath);
    closeTriggeredReminder();
  };

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed right-5 top-12 z-[90] w-[360px] max-w-[calc(100vw-40px)] overflow-hidden rounded-xl border shadow-2xl"
      style={{
        backgroundColor: "var(--bg-secondary)",
        borderColor: "var(--border-color)",
        color: "var(--text-primary)",
      }}
    >
      <div
        className="flex items-start gap-3 border-b px-4 py-3"
        style={{ borderColor: "var(--border-color)" }}
      >
        <Bell
          className="mt-0.5 h-5 w-5 flex-shrink-0"
          style={{ color: "var(--accent-color)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">
            {reminder.title}
          </div>
          <div
            className="mt-0.5 truncate text-[12px]"
            style={{ color: "var(--text-muted)" }}
          >
            {detail}
          </div>
        </div>
        <button
          type="button"
          aria-label="关闭提醒通知"
          data-theme-control="true"
          className="rounded-md p-1"
          style={{ color: "var(--text-muted)" }}
          onClick={closeTriggeredReminder}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex justify-end gap-2 px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          onClick={closeTriggeredReminder}
        >
          稍后
        </Button>
        {reminder.filePath ? (
          <Button type="button" onClick={() => void handleOpen()}>
            打开
          </Button>
        ) : null}
      </div>
    </div>
  );
}
