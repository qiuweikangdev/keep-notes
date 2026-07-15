import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Repeat2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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

const repeatOptions: Array<{
  label: string;
  value: ReminderRepeatPreset;
  separated?: boolean;
}> = [
  { label: "永不", value: "never" },
  { label: "每小时", value: "hourly", separated: true },
  { label: "每天", value: "daily" },
  { label: "工作日", value: "weekdays" },
  { label: "周末", value: "weekends" },
  { label: "每周", value: "weekly" },
  { label: "每两周", value: "biweekly" },
  { label: "每月", value: "monthly" },
  { label: "每两个月", value: "bimonthly" },
  { label: "每 3 个月", value: "quarterly" },
  { label: "每 6 个月", value: "semiannual" },
  { label: "每年", value: "yearly" },
  { label: "自定义", value: "custom", separated: true },
];

const controlClassName =
  "h-8 rounded-md border px-2.5 text-[13px] outline-none transition-colors focus:border-[var(--accent-color)]";

const weekdayLabels = ["日", "一", "二", "三", "四", "五", "六"];
const hourOptions = Array.from({ length: 24 }, (_, index) =>
  String(index).padStart(2, "0"),
);
const minuteOptions = Array.from({ length: 60 }, (_, index) =>
  String(index).padStart(2, "0"),
);

function getFileName(filePath: string | null): string {
  if (!filePath) return "";
  return filePath.split(/[\\/]/).pop() ?? filePath;
}

function formatDateValue(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function parseDateValue(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function formatDisplayDate(value: string): string {
  return value.replaceAll("-", "/");
}

function getCalendarCells(displayMonth: Date) {
  const year = displayMonth.getFullYear();
  const month = displayMonth.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  return Array.from({ length: 42 }, (_, index) => {
    const day = index - startOffset + 1;
    if (day < 1 || day > daysInMonth) return null;
    return new Date(year, month, day);
  });
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

function useCloseOnOutsidePointerDown(
  open: boolean,
  containerRef: RefObject<HTMLElement>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    // 自绘浮层不经过 Radix Popover，统一监听外部点击来模拟系统浮窗的收起体验。
    const handlePointerDown = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        containerRef.current?.contains(event.target)
      ) {
        return;
      }
      onClose();
    };

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [containerRef, onClose, open]);
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
  const [openPicker, setOpenPicker] = useState<
    "date" | "time" | "repeat" | null
  >(null);
  const [displayMonth, setDisplayMonth] = useState(() =>
    parseDateValue(initialState.date),
  );

  useEffect(() => {
    if (!isEditorOpen) {
      setIsCustomOpen(false);
      setOpenPicker(null);
      return;
    }
    const nextInitialState = getInitialState(editingReminder, draftFilePath);
    setTitle(nextInitialState.title);
    setDate(nextInitialState.date);
    setTime(nextInitialState.time);
    setRepeat(nextInitialState.repeat);
    setCustomRepeat(nextInitialState.customRepeat);
    setIsCustomOpen(false);
    setOpenPicker(null);
    setDisplayMonth(parseDateValue(nextInitialState.date));
  }, [draftFilePath, editingReminder, isEditorOpen]);

  const filePath = editingReminder?.filePath ?? draftFilePath ?? "";
  const fileName = getFileName(filePath);
  const canSave = title.trim().length > 0 && date.length > 0 && time.length > 0;

  const handleRepeatChange = (value: ReminderRepeatPreset) => {
    if (value === "custom") {
      setIsCustomOpen(true);
      return;
    }
    setRepeat(value);
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
      <Dialog.Root
        modal={false}
        open={isEditorOpen}
        onOpenChange={(open) => {
          // Dialog 可能在嵌套控件完成交互后再次同步当前打开状态，此时不能误关闭编辑器。
          if (!open) closeEditor();
        }}
      >
        <DialogContent
          showCloseButton={false}
          className="top-[calc(12vh+72px)] z-[60] w-[calc(100%-32px)] max-w-[420px] translate-y-0 gap-0 overflow-visible rounded-xl p-0 shadow-xl"
          data-reminder-editor-dialog="true"
          style={{
            backgroundColor: "var(--bg-primary)",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="animate-fade-in motion-reduce:animate-none">
            <div className="flex h-11 items-center justify-between border-b border-[var(--border-color)] px-4">
              <Dialog.Title className="text-sm font-semibold">
                {editingReminder ? "修改提醒事项" : "新建提醒事项"}
              </Dialog.Title>
              <Dialog.Close
                aria-label="关闭"
                className="flex h-6 w-6 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">
              设置提醒标题、日期时间和重复频率
            </Dialog.Description>
            <div className="px-4 pb-3 pt-3">
              <div>
                <Input
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  placeholder="标题"
                  className="h-9 px-3 py-1 text-sm"
                  style={{
                    backgroundColor:
                      "color-mix(in srgb, var(--bg-secondary) 72%, var(--bg-primary))",
                    border: "1px solid var(--border-color)",
                    color: "var(--text-primary)",
                  }}
                  autoFocus
                />
                {fileName ? (
                  <p className="mt-1.5 truncate px-1 text-[11px] text-[var(--text-muted)]">
                    {fileName}
                  </p>
                ) : null}
              </div>

              <div
                className="mt-3 overflow-visible rounded-lg border border-[var(--border-color)]"
                data-testid="reminder-settings-group"
                style={{
                  backgroundColor:
                    "color-mix(in srgb, var(--bg-secondary) 42%, var(--bg-primary))",
                }}
              >
                <ReminderSettingRow
                  icon={<CalendarDays className="h-4 w-4" />}
                  label="日期"
                >
                  <DatePickerControl
                    value={date}
                    disabled={false}
                    open={openPicker === "date"}
                    displayMonth={displayMonth}
                    onDisplayMonthChange={setDisplayMonth}
                    onOpenChange={(open) => setOpenPicker(open ? "date" : null)}
                    onChange={(value) => {
                      setDate(value);
                      setDisplayMonth(parseDateValue(value));
                      setOpenPicker(null);
                    }}
                  />
                </ReminderSettingRow>
                <div className="mx-3 h-px bg-[var(--border-color)]" />
                <ReminderSettingRow
                  icon={<Clock3 className="h-4 w-4" />}
                  label="时间"
                >
                  <TimePickerControl
                    value={time}
                    disabled={false}
                    open={openPicker === "time"}
                    onOpenChange={(open) => setOpenPicker(open ? "time" : null)}
                    onChange={setTime}
                  />
                </ReminderSettingRow>
                <div className="mx-3 h-px bg-[var(--border-color)]" />
                <ReminderSettingRow
                  icon={<Repeat2 className="h-4 w-4" />}
                  label="重复"
                >
                  <RepeatPickerControl
                    value={repeat}
                    open={openPicker === "repeat"}
                    onOpenChange={(open) =>
                      setOpenPicker(open ? "repeat" : null)
                    }
                    onChange={(value) => {
                      handleRepeatChange(value);
                      setOpenPicker(null);
                    }}
                  />
                </ReminderSettingRow>
                {repeat === "custom" ? (
                  <button
                    type="button"
                    className="mb-3 ml-11 rounded-sm text-[12px] font-medium"
                    style={{ color: "var(--accent-color)" }}
                    onClick={() => setIsCustomOpen(true)}
                  >
                    {getRepeatLabel({ repeat, customRepeat })}，点击修改
                  </button>
                ) : null}
              </div>
            </div>

            <div
              className="flex justify-end gap-2 border-t border-[var(--border-color)] px-4 py-2.5"
              style={{
                backgroundColor:
                  "color-mix(in srgb, var(--bg-secondary) 32%, var(--bg-primary))",
              }}
            >
              <Button type="button" variant="secondary" onClick={closeEditor}>
                取消
              </Button>
              <Button type="button" disabled={!canSave} onClick={handleSave}>
                保存提醒
              </Button>
            </div>
          </div>

          <CustomRepeatDialog
            open={isCustomOpen}
            value={customRepeat}
            onOpenChange={setIsCustomOpen}
            onConfirm={(value) => {
              setCustomRepeat(value);
              setRepeat("custom");
            }}
          />
        </DialogContent>
      </Dialog.Root>
    </>
  );
}

interface ReminderSettingRowProps {
  icon: ReactNode;
  label: string;
  children: ReactNode;
}

function ReminderSettingRow({
  icon,
  label,
  children,
}: ReminderSettingRowProps) {
  return (
    <div className="grid min-h-11 grid-cols-[18px_minmax(0,1fr)_minmax(112px,132px)] items-center gap-2.5 px-3 py-1.5 transition-colors first:rounded-t-lg last:rounded-b-lg hover:bg-[var(--hover-bg)]">
      <div
        className="flex h-5 w-5 items-center justify-center"
        style={{ color: "var(--text-muted)" }}
      >
        {icon}
      </div>
      <div className="text-[13px] font-medium">{label}</div>
      {children}
    </div>
  );
}

interface DatePickerControlProps {
  value: string;
  disabled: boolean;
  open: boolean;
  displayMonth: Date;
  onChange: (value: string) => void;
  onDisplayMonthChange: (value: Date) => void;
  onOpenChange: (open: boolean) => void;
}

function DatePickerControl({
  value,
  disabled,
  open,
  displayMonth,
  onChange,
  onDisplayMonthChange,
  onOpenChange,
}: DatePickerControlProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const calendarCells = useMemo(
    () => getCalendarCells(displayMonth),
    [displayMonth],
  );
  const todayValue = formatDateValue(new Date());
  const monthTitle = `${displayMonth.getFullYear()}年 ${displayMonth.getMonth() + 1}月`;

  useCloseOnOutsidePointerDown(open, pickerRef, () => onOpenChange(false));

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        data-theme-control="true"
        disabled={disabled}
        aria-expanded={open}
        className={`${controlClassName} flex w-full items-center justify-between gap-2`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
        onClick={() => onOpenChange(!open)}
      >
        <span>{formatDisplayDate(value)}</span>
        <CalendarDays
          className="h-4 w-4"
          style={{ color: "var(--text-muted)" }}
        />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[284px] rounded-lg border p-3 shadow-lg"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="mb-3 flex items-center justify-between">
            <button
              type="button"
              aria-label="上个月"
              data-theme-control="true"
              className="flex h-8 w-8 items-center justify-center rounded-md"
              onClick={() =>
                onDisplayMonthChange(
                  new Date(
                    displayMonth.getFullYear(),
                    displayMonth.getMonth() - 1,
                    1,
                  ),
                )
              }
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <div className="text-[13px] font-semibold">{monthTitle}</div>
            <button
              type="button"
              aria-label="下个月"
              data-theme-control="true"
              className="flex h-8 w-8 items-center justify-center rounded-md"
              onClick={() =>
                onDisplayMonthChange(
                  new Date(
                    displayMonth.getFullYear(),
                    displayMonth.getMonth() + 1,
                    1,
                  ),
                )
              }
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div
            className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            {weekdayLabels.map((label) => (
              <div key={label} className="py-1">
                {label}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarCells.map((cell, index) => {
              if (!cell) {
                return <span key={`empty-${index}`} className="h-8" />;
              }

              const cellValue = formatDateValue(cell);
              const isSelected = cellValue === value;
              const isToday = cellValue === todayValue;

              return (
                <button
                  key={cellValue}
                  type="button"
                  data-theme-control="true"
                  data-selected={isSelected ? "true" : undefined}
                  className="flex h-8 items-center justify-center rounded-md border text-[13px] font-medium"
                  style={{
                    borderColor: isToday
                      ? "var(--accent-color)"
                      : "transparent",
                  }}
                  onClick={() => onChange(cellValue)}
                >
                  {cell.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface TimePickerControlProps {
  value: string;
  disabled: boolean;
  open: boolean;
  onChange: (value: string) => void;
  onOpenChange: (open: boolean) => void;
}

function TimePickerControl({
  value,
  disabled,
  open,
  onChange,
  onOpenChange,
}: TimePickerControlProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const [selectedHour, selectedMinute] = value.split(":");

  useCloseOnOutsidePointerDown(open, pickerRef, () => onOpenChange(false));

  const updateTime = (nextHour: string, nextMinute: string) => {
    onChange(`${nextHour}:${nextMinute}`);
  };

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        data-theme-control="true"
        disabled={disabled}
        aria-expanded={open}
        className={`${controlClassName} flex w-full items-center justify-between gap-2`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
        onClick={() => onOpenChange(!open)}
      >
        <span>{value}</span>
        <Clock3 className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
      </button>
      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+8px)] z-[80] w-[212px] rounded-lg border p-2 shadow-lg"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div
            className="mb-2 grid grid-cols-2 gap-2 px-2 text-center text-[11px] font-medium"
            style={{ color: "var(--text-muted)" }}
          >
            <span>小时</span>
            <span>分钟</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <TimePickerColumn
              options={hourOptions}
              value={selectedHour}
              onSelect={(hour) => updateTime(hour, selectedMinute)}
            />
            <TimePickerColumn
              options={minuteOptions}
              value={selectedMinute}
              onSelect={(minute) => updateTime(selectedHour, minute)}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface TimePickerColumnProps {
  options: string[];
  value: string;
  onSelect: (value: string) => void;
}

function TimePickerColumn({ options, value, onSelect }: TimePickerColumnProps) {
  const selectedOptionRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    // 下拉每次打开时列会重新挂载，自动把当前选中的时/分滚动到可见位置。
    selectedOptionRef.current?.scrollIntoView({
      block: "center",
      behavior: "auto",
    });
  }, [value]);

  return (
    <div
      className="max-h-[216px] space-y-1 overflow-y-auto rounded-md p-1"
      style={{ backgroundColor: "var(--bg-secondary)" }}
    >
      {options.map((option) => {
        const isSelected = option === value;
        return (
          <button
            key={option}
            type="button"
            ref={isSelected ? selectedOptionRef : undefined}
            data-theme-control="true"
            data-selected={isSelected ? "true" : undefined}
            className="flex h-8 w-full items-center justify-center rounded-md text-[13px] font-medium"
            onClick={() => onSelect(option)}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

interface RepeatPickerControlProps {
  value: ReminderRepeatPreset;
  open: boolean;
  onChange: (value: ReminderRepeatPreset) => void;
  onOpenChange: (open: boolean) => void;
}

function RepeatPickerControl({
  value,
  open,
  onChange,
  onOpenChange,
}: RepeatPickerControlProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    repeatOptions.find((option) => option.value === value)?.label ?? "永不";

  useCloseOnOutsidePointerDown(open, pickerRef, () => onOpenChange(false));

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        data-theme-control="true"
        aria-expanded={open}
        className={`${controlClassName} flex w-full items-center justify-between gap-2`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
        onClick={() => onOpenChange(!open)}
      >
        <span>{selectedLabel}</span>
        <ChevronRight
          className="h-4 w-4 rotate-90"
          style={{ color: "var(--text-muted)" }}
        />
      </button>
      {open ? (
        <div
          className="absolute bottom-[calc(100%+8px)] right-0 z-[80] w-[184px] rounded-xl border p-2 shadow-lg"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="max-h-[320px] space-y-1 overflow-y-auto pr-1">
            {repeatOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <div key={option.value}>
                  {option.separated ? (
                    <div
                      className="my-1 h-px"
                      style={{ backgroundColor: "var(--border-color)" }}
                    />
                  ) : null}
                  <button
                    type="button"
                    data-theme-control="true"
                    data-selected={isSelected ? "true" : undefined}
                    className="flex h-10 w-full items-center justify-between rounded-lg px-3 text-left text-[14px] font-semibold"
                    onClick={() => onChange(option.value)}
                  >
                    <span>{option.label}</span>
                    {isSelected ? (
                      <span aria-hidden="true" className="text-[15px]">
                        ✓
                      </span>
                    ) : null}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
