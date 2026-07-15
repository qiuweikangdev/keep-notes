import { useEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import { Check, ChevronRight, X } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ReminderRepeatCustomRule, ReminderRepeatUnit } from "@/types";

const unitOptions: Array<{ label: string; value: ReminderRepeatUnit }> = [
  { label: "小时", value: "hour" },
  { label: "天", value: "day" },
  { label: "周", value: "week" },
  { label: "月", value: "month" },
  { label: "年", value: "year" },
];

const repeatControlClassName =
  "h-9 rounded-md px-3 text-[13px] outline-none transition-colors focus:border-[var(--text-muted)] focus:ring-0";

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
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        overlayClassName="z-[70]"
        overlayStyle={{ backgroundColor: "rgba(0, 0, 0, 0.22)" }}
        onPointerDownOutside={() => onOpenChange(false)}
        className="z-[71] w-[calc(100%-32px)] max-w-[336px] gap-0 overflow-visible rounded-xl p-0 shadow-[0_12px_28px_rgba(0,0,0,0.24)]"
        data-custom-repeat-dialog="true"
        style={{
          backgroundColor:
            "color-mix(in srgb, var(--bg-tertiary) 36%, var(--bg-primary))",
          border: "none",
          color: "var(--text-primary)",
        }}
      >
        <div className="flex h-11 items-center justify-between border-b border-[var(--border-color)] px-4">
          <Dialog.Title className="text-sm font-semibold">
            自定义重复
          </Dialog.Title>
          <Dialog.Close
            aria-label="关闭"
            className="flex h-7 w-7 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Dialog.Close>
        </div>
        <Dialog.Description className="sr-only">
          设置提醒事项的自定义重复间隔
        </Dialog.Description>

        <div className="px-4 py-4">
          <label
            htmlFor="custom-repeat-interval"
            className="mb-1.5 block text-xs font-medium text-[var(--text-secondary)]"
          >
            重复规则
          </label>
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[13px] text-[var(--text-secondary)]">
              每
            </span>
            <Input
              id="custom-repeat-interval"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={interval}
              onChange={(event) => setInterval(event.target.value)}
              aria-label="重复间隔"
              aria-invalid={!isValid}
              className={`${repeatControlClassName} w-16 shrink-0 px-2 text-center font-semibold`}
              style={{
                backgroundColor: "var(--bg-secondary)",
                borderColor: isValid
                  ? "var(--border-color)"
                  : "var(--danger-color)",
                color: "var(--text-primary)",
              }}
            />
            <div className="min-w-0 flex-1">
              <UnitPickerControl
                value={unit}
                open={isUnitOpen}
                onOpenChange={setIsUnitOpen}
                onChange={(nextUnit) => {
                  setUnit(nextUnit);
                  setIsUnitOpen(false);
                }}
              />
            </div>
          </div>
          {!isValid ? (
            <p className="mt-1.5 text-xs text-[var(--danger-color)]">
              请输入大于 0 的整数
            </p>
          ) : null}
        </div>

        <div
          className="flex justify-end gap-2 rounded-b-xl border-t border-[var(--border-color)] px-4 py-3"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--bg-secondary) 38%, var(--bg-primary))",
          }}
        >
          <Dialog.Close asChild>
            <Button type="button" variant="secondary">
              取消
            </Button>
          </Dialog.Close>
          <Button type="button" disabled={!isValid} onClick={handleConfirm}>
            确定
          </Button>
        </div>
      </DialogContent>
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
    unitOptions.find((option) => option.value === value)?.label ?? "天";

  useCloseOnOutsidePointerDown(open, pickerRef, () => onOpenChange(false));

  return (
    <div className="relative" ref={pickerRef}>
      <button
        type="button"
        data-theme-control="true"
        aria-label="重复单位"
        aria-expanded={open}
        className={`${repeatControlClassName} flex w-full items-center justify-between gap-2 border font-medium`}
        style={{
          backgroundColor: "var(--bg-secondary)",
          borderColor: "var(--border-color)",
          color: "var(--text-primary)",
        }}
        onClick={() => onOpenChange(!open)}
      >
        <span className="min-w-0 truncate">{selectedLabel}</span>
        <ChevronRight
          className="h-4 w-4 rotate-90"
          style={{ color: "var(--text-muted)" }}
        />
      </button>
      {open ? (
        <div
          className="absolute left-0 top-[calc(100%+6px)] z-[82] w-full rounded-lg border p-1.5 shadow-[0_6px_12px_rgba(0,0,0,0.16)]"
          style={{
            backgroundColor: "var(--bg-primary)",
            borderColor: "var(--border-color)",
            color: "var(--text-primary)",
          }}
        >
          <div className="space-y-0.5">
            {unitOptions.map((option) => {
              const isSelected = option.value === value;
              return (
                <button
                  key={option.value}
                  type="button"
                  data-theme-control="true"
                  data-selected={isSelected ? "true" : undefined}
                  className="flex h-8 w-full items-center justify-between rounded-md px-2.5 text-left text-[13px] font-medium"
                  onClick={() => onChange(option.value)}
                >
                  <span>{option.label}</span>
                  {isSelected ? (
                    <Check aria-hidden="true" className="h-3.5 w-3.5" />
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
