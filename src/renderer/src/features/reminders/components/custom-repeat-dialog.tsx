import { useEffect, useMemo, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReminderRepeatCustomRule, ReminderRepeatUnit } from "@/types";

const unitLabels: Record<ReminderRepeatUnit, string> = {
  day: "天",
  week: "周",
  month: "月",
  year: "年",
};

const unitOptions: Array<{ label: string; value: ReminderRepeatUnit }> = [
  { label: "每天", value: "day" },
  { label: "每周", value: "week" },
  { label: "每月", value: "month" },
  { label: "每年", value: "year" },
];

interface CustomRepeatDialogProps {
  open: boolean;
  value?: ReminderRepeatCustomRule;
  onOpenChange: (open: boolean) => void;
  onConfirm: (value: ReminderRepeatCustomRule) => void;
}

export function CustomRepeatDialog({
  open,
  value,
  onOpenChange,
  onConfirm,
}: CustomRepeatDialogProps) {
  const [unit, setUnit] = useState<ReminderRepeatUnit>(value?.unit ?? "day");
  const [interval, setInterval] = useState(String(value?.interval ?? 1));

  useEffect(() => {
    if (!open) return;
    setUnit(value?.unit ?? "day");
    setInterval(String(value?.interval ?? 1));
  }, [open, value]);

  const parsedInterval = useMemo(() => Number(interval), [interval]);
  const isValid =
    Number.isInteger(parsedInterval) &&
    Number.isFinite(parsedInterval) &&
    parsedInterval > 0;

  const handleConfirm = () => {
    if (!isValid) return;
    onConfirm({ interval: parsedInterval, unit });
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[70]"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.3)" }}
        />
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-[71] w-[400px] max-w-[92vw] translate-x-[-50%] translate-y-[-50%] rounded-[28px] border p-8 shadow-2xl"
          style={{
            backgroundColor: "rgba(32, 38, 32, 0.96)",
            borderColor: "rgba(255, 255, 255, 0.18)",
            color: "var(--text-primary)",
          }}
        >
          <Dialog.Title className="sr-only">自定义重复</Dialog.Title>
          <div className="space-y-5 text-[20px] font-semibold">
            <label className="grid grid-cols-[72px_1fr] items-center gap-2">
              <span>频率：</span>
              <select
                value={unit}
                onChange={(event) =>
                  setUnit(event.target.value as ReminderRepeatUnit)
                }
                className="h-12 rounded-lg border-0 px-4 text-center text-[18px] font-semibold outline-none"
                style={{
                  backgroundColor: "rgba(255, 255, 255, 0.14)",
                  color: "var(--text-primary)",
                }}
              >
                {unitOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="grid grid-cols-[36px_64px_1fr] items-center gap-3">
              <span>每</span>
              <Input
                type="number"
                min={1}
                step={1}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                className="h-12 rounded-xl text-center text-[20px] font-semibold"
                style={{
                  borderColor: isValid ? "var(--border-color)" : "#ff6961",
                }}
              />
              <span>{unitLabels[unit]}</span>
            </label>
          </div>

          <div className="mt-8 flex justify-center gap-5">
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="secondary"
                className="h-12 min-w-[96px] rounded-lg text-[18px]"
              >
                取消
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={!isValid}
              onClick={handleConfirm}
              className="h-12 min-w-[96px] rounded-lg text-[18px]"
              style={{ backgroundColor: "#ff4f57" }}
            >
              好
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
