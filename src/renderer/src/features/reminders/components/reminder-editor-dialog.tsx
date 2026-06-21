import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Clock3, Repeat2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useReminderStore } from "@/store/reminder.store";
import type {
  Reminder,
  ReminderRepeatCustomRule,
  ReminderRepeatPreset,
} from "@/types";
import {
  composeScheduledAt,
  getDefaultReminderDateTime,
  getRepeatLabel,
  splitScheduledAt,
} from "../lib/reminder-format";
import { CustomRepeatDialog } from "./custom-repeat-dialog";

const repeatOptions: Array<{ label: string; value: ReminderRepeatPreset }> = [
  { label: "永不", value: "never" },
  { label: "每天", value: "daily" },
  { label: "工作日", value: "weekdays" },
  { label: "周末", value: "weekends" },
  { label: "每周", value: "weekly" },
  { label: "每两周", value: "biweekly" },
  { label: "每月", value: "monthly" },
  { label: "每 3 个月", value: "quarterly" },
  { label: "每 6 个月", value: "semiannual" },
  { label: "每年", value: "yearly" },
  { label: "自定义", value: "custom" },
];

function getFileName(filePath: string | null): string {
  if (!filePath) return "";
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function getInitialState(
  reminder: Reminder | undefined,
  filePath: string | null,
) {
  const dateTime = reminder
    ? splitScheduledAt(reminder.scheduledAt)
    : getDefaultReminderDateTime();

  return {
    title: reminder?.title ?? "",
    date: dateTime.date,
    time: dateTime.time,
    repeat: reminder?.repeat ?? ("never" as ReminderRepeatPreset),
    customRepeat: reminder?.customRepeat,
    filePath: reminder?.filePath ?? filePath ?? "",
  };
}

export function ReminderEditorDialog() {
  const reminders = useReminderStore((state) => state.reminders);
  const isEditorOpen = useReminderStore((state) => state.isEditorOpen);
  const editingReminderId = useReminderStore(
    (state) => state.editingReminderId,
  );
  const draftFilePath = useReminderStore((state) => state.draftFilePath);
  const closeEditor = useReminderStore((state) => state.closeEditor);
  const createReminder = useReminderStore((state) => state.createReminder);
  const updateReminder = useReminderStore((state) => state.updateReminder);

  const editingReminder = useMemo(
    () => reminders.find((reminder) => reminder.id === editingReminderId),
    [editingReminderId, reminders],
  );

  const initialState = useMemo(
    () => getInitialState(editingReminder, draftFilePath),
    [draftFilePath, editingReminder],
  );

  const [title, setTitle] = useState(initialState.title);
  const [date, setDate] = useState(initialState.date);
  const [time, setTime] = useState(initialState.time);
  const [repeat, setRepeat] = useState<ReminderRepeatPreset>(
    initialState.repeat,
  );
  const [customRepeat, setCustomRepeat] = useState<
    ReminderRepeatCustomRule | undefined
  >(initialState.customRepeat);
  const [isCustomOpen, setIsCustomOpen] = useState(false);
  const [isDateEnabled, setIsDateEnabled] = useState(true);
  const [isTimeEnabled, setIsTimeEnabled] = useState(true);

  useEffect(() => {
    if (!isEditorOpen) return;
    setTitle(initialState.title);
    setDate(initialState.date);
    setTime(initialState.time);
    setRepeat(initialState.repeat);
    setCustomRepeat(initialState.customRepeat);
    setIsDateEnabled(true);
    setIsTimeEnabled(true);
  }, [initialState, isEditorOpen]);

  const filePath = initialState.filePath;
  const canSave =
    title.trim().length > 0 &&
    filePath.length > 0 &&
    date.length > 0 &&
    time.length > 0 &&
    isDateEnabled &&
    isTimeEnabled;

  const handleRepeatChange = (value: ReminderRepeatPreset) => {
    setRepeat(value);
    if (value === "custom") {
      setIsCustomOpen(true);
    }
  };

  const handleSave = async () => {
    if (!canSave) return;

    // 日期和时间是用户输入的本地值，组合后交给 Date 转成 ISO，主进程统一按本地桌面提醒调度。
    const scheduledAt = composeScheduledAt(date, time);
    const input = {
      title: title.trim(),
      filePath,
      scheduledAt,
      repeat,
      customRepeat: repeat === "custom" ? customRepeat : undefined,
    };

    // 创建和编辑共用同一个弹窗，避免两套表单逻辑产生细微差异。
    if (editingReminder) {
      await updateReminder(editingReminder.id, input);
    } else {
      await createReminder(input);
    }
  };

  return (
    <>
      <Dialog.Root open={isEditorOpen} onOpenChange={closeEditor}>
        <DialogContent
          className="max-w-[520px] gap-0 overflow-hidden rounded-2xl p-0"
          showCloseButton={false}
        >
          <Dialog.Title className="sr-only">
            {editingReminder ? "修改提醒事项" : "新建提醒事项"}
          </Dialog.Title>
          <div
            className="space-y-5 p-5"
            style={{ backgroundColor: "var(--bg-secondary)" }}
          >
            <div
              className="rounded-2xl px-5 py-4"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <Input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="标题"
                className="h-12 border-0 bg-transparent px-0 text-[28px] font-semibold"
                autoFocus
              />
              <p
                className="mt-1 truncate text-[13px]"
                style={{ color: "var(--text-muted)" }}
              >
                {getFileName(filePath)}
              </p>
            </div>

            <section>
              <h3
                className="mb-2 px-1 text-[13px] font-semibold"
                style={{ color: "var(--text-muted)" }}
              >
                日期与时间
              </h3>
              <div
                className="overflow-hidden rounded-2xl"
                style={{ backgroundColor: "var(--bg-primary)" }}
              >
                <ReminderRow
                  icon={<CalendarDays className="h-5 w-5" />}
                  title="日期"
                  detail={date}
                  checked={isDateEnabled}
                  onCheckedChange={setIsDateEnabled}
                >
                  <Input
                    type="date"
                    value={date}
                    onChange={(event) => setDate(event.target.value)}
                    disabled={!isDateEnabled}
                    className="h-9 w-[160px]"
                  />
                </ReminderRow>
                <div className="mx-5 h-px bg-[var(--border-color)]" />
                <ReminderRow
                  icon={<Clock3 className="h-5 w-5" />}
                  title="时间"
                  detail={time}
                  checked={isTimeEnabled}
                  onCheckedChange={setIsTimeEnabled}
                >
                  <Input
                    type="time"
                    value={time}
                    onChange={(event) => setTime(event.target.value)}
                    disabled={!isTimeEnabled}
                    className="h-9 w-[120px]"
                  />
                </ReminderRow>
              </div>
            </section>

            <div
              className="rounded-2xl px-5 py-3"
              style={{ backgroundColor: "var(--bg-primary)" }}
            >
              <div className="flex items-center gap-4">
                <Repeat2
                  className="h-5 w-5 flex-shrink-0"
                  style={{ color: "var(--text-muted)" }}
                />
                <span className="font-medium">重复</span>
                <select
                  value={repeat}
                  onChange={(event) =>
                    handleRepeatChange(
                      event.target.value as ReminderRepeatPreset,
                    )
                  }
                  className="ml-auto h-9 rounded-md border px-3 text-[13px] outline-none"
                  style={{
                    backgroundColor: "var(--bg-secondary)",
                    borderColor: "var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                >
                  {repeatOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
              {repeat === "custom" ? (
                <button
                  type="button"
                  className="mt-2 text-[12px]"
                  style={{ color: "var(--accent-color)" }}
                  onClick={() => setIsCustomOpen(true)}
                >
                  {getRepeatLabel({ repeat, customRepeat })}，点击修改
                </button>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={closeEditor}>
                取消
              </Button>
              <Button type="button" disabled={!canSave} onClick={handleSave}>
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog.Root>

      <CustomRepeatDialog
        open={isCustomOpen}
        value={customRepeat}
        onOpenChange={setIsCustomOpen}
        onConfirm={(value) => {
          setCustomRepeat(value);
          setRepeat("custom");
        }}
      />
    </>
  );
}

interface ReminderRowProps {
  icon: React.ReactNode;
  title: string;
  detail: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  children: React.ReactNode;
}

function ReminderRow({
  icon,
  title,
  detail,
  checked,
  onCheckedChange,
  children,
}: ReminderRowProps) {
  return (
    <div className="grid grid-cols-[24px_1fr_auto_auto] items-center gap-4 px-5 py-4">
      <div style={{ color: "var(--text-muted)" }}>{icon}</div>
      <div>
        <div className="font-medium">{title}</div>
        <div className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          {detail}
        </div>
      </div>
      {children}
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
