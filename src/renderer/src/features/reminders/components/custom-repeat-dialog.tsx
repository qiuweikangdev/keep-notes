import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { ChevronRight } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReminderRepeatCustomRule, ReminderRepeatUnit } from "@/types";

const unitLabels: Record<ReminderRepeatUnit, string> = {
  hour: "小时",
  day: "天",
  week: "周",
  month: "月",
  year: "年",
};

const unitOptions: Array<{ label: string; value: ReminderRepeatUnit }> = [
  { label: "每小时", value: "hour" },
  { label: "每天", value: "day" },
  { label: "每周", value: "week" },
  { label: "每月", value: "month" },
  { label: "每年", value: "year" },
];

const repeatControlClassName =
  "h-9 rounded-md px-3 text-[13px] outline-none transition-colors focus:border-[var(--accent-color)]";

function useCloseOnOutsidePointerDown(
  open: boolean,
  containerRef: RefObject<HTMLElement>,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) return;

    // 自定义下拉是自绘浮层，点击控件外部时主动关闭，避免菜单遮挡后续操作。
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
  const [isUnitOpen, setIsUnitOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    setUnit(value?.unit ?? "day");
    setInterval(String(value?.interval ?? 1));
    setIsUnitOpen(false);
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
          onPointerDownOutside={() => onOpenChange(false)}
          className="fixed left-[50%] top-[50%] z-[71] w-[360px] max-w-[92vw] translate-x-[-50%] translate-y-[-50%] overflow-visible rounded-xl border shadow-lg"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <Dialog.Title className="sr-only">自定义重复</Dialog.Title>
          <div
            className="border-b px-5 py-4"
            style={{ borderColor: "var(--border-color)" }}
          >
            <h3 className="text-[15px] font-semibold">自定义重复</h3>
          </div>

          <div className="space-y-3 px-5 py-4">
            <label className="grid grid-cols-[64px_1fr] items-center gap-3">
              <span
                className="text-[13px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                频率
              </span>
              <UnitPickerControl
                value={unit}
                open={isUnitOpen}
                onOpenChange={setIsUnitOpen}
                onChange={(nextUnit) => {
                  setUnit(nextUnit);
                  setIsUnitOpen(false);
                }}
              />
            </label>

            <label className="grid grid-cols-[64px_76px_1fr] items-center gap-3">
              <span
                className="text-[13px] font-medium"
                style={{ color: "var(--text-muted)" }}
              >
                每
              </span>
              <Input
                type="number"
                min={1}
                step={1}
                value={interval}
                onChange={(event) => setInterval(event.target.value)}
                aria-invalid={!isValid}
                className={`${repeatControlClassName} text-center font-semibold`}
                style={{
                  backgroundColor: "var(--bg-primary)",
                  borderColor: isValid
                    ? "var(--border-color)"
                    : "var(--danger-color)",
                }}
              />
              <span className="text-[14px] font-medium">
                {unitLabels[unit]}
              </span>
            </label>
            {!isValid ? (
              <p
                className="pl-[76px] text-[12px]"
                style={{ color: "var(--danger-color)" }}
              >
                请输入大于 0 的整数
              </p>
            ) : null}
          </div>

          <div
            className="flex justify-end gap-2 rounded-b-xl border-t px-5 py-4"
            style={{
              backgroundColor: "var(--bg-secondary)",
              borderColor: "var(--border-color)",
            }}
          >
            <Dialog.Close asChild>
              <Button
                type="button"
                variant="secondary"
                className="min-w-[60px]"
              >
                取消
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              disabled={!isValid}
              onClick={handleConfirm}
              className="min-w-[60px]"
            >
              好
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

interface UnitPickerControlProps {
  value: ReminderRepeatUnit;
  open: boolean;
  onChange: (value: ReminderRepeatUnit) => void;
  onOpenChange: (open: boolean) => void;
}

function UnitPickerControl({
  value,
  open,
  onChange,
  onOpenChange,
}: UnitPickerControlProps) {
  const pickerRef = useRef<HTMLDivElement>(null);
  const selectedLabel =
    unitOptions.find((option) => option.value === value)?.label ?? "每天";

  useCloseOnOutsidePointerDown(open, pickerRef, () => onOpenChange(false));

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        data-theme-control="true"
        aria-expanded={open}
        className={`${repeatControlClassName} flex w-full items-center justify-between gap-2 border font-medium`}
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
          className="absolute left-0 top-[calc(100%+8px)] z-[82] w-full rounded-xl border p-2 shadow-lg"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="max-h-[240px] space-y-1 overflow-y-auto pr-1">
            {unitOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
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
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
