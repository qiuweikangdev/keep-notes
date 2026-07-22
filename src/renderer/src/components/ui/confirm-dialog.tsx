import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import {
  CircleAlert,
  Trash2,
  TriangleAlert,
  X,
  type LucideIcon,
} from "lucide-react";
import { useRef, type MouseEvent } from "react";

type ConfirmDialogVariant = "default" | "warning" | "danger";

function stopPortalClick(event: MouseEvent) {
  event.stopPropagation();
}

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: ConfirmDialogVariant;
  icon?: LucideIcon;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  variant = "default",
  icon,
  onConfirm,
}: ConfirmDialogProps) {
  const cancelButtonRef = useRef<HTMLButtonElement>(null);
  const isDanger = variant === "danger";
  const isWarning = variant === "warning";
  const defaultIcon = isDanger
    ? Trash2
    : isWarning
      ? TriangleAlert
      : CircleAlert;
  const TitleIcon = icon ?? defaultIcon;
  const titleIconColor =
    isDanger || isWarning ? "var(--danger-color)" : "var(--text-muted)";

  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  return (
    <Dialog.Root modal={false} open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
          onClick={stopPortalClick}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-32px)] max-w-[360px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl p-0 outline-none"
          style={{
            backgroundColor:
              "color-mix(in srgb, var(--bg-secondary) 42%, var(--bg-primary))",
            border: "1px solid var(--border-color)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.16)",
            color: "var(--text-primary)",
          }}
          onOpenAutoFocus={(event) => {
            // 危险操作默认聚焦取消按钮，避免用户按回车时误确认。
            event.preventDefault();
            cancelButtonRef.current?.focus();
          }}
          onClick={stopPortalClick}
        >
          <div className="flex h-14 items-center justify-between border-b border-[var(--border-color)] px-5">
            <Dialog.Title className="flex items-center gap-2.5 text-base font-semibold leading-6">
              <TitleIcon
                aria-hidden="true"
                className="h-5 w-5 shrink-0"
                style={{ color: titleIconColor }}
              />
              {title}
            </Dialog.Title>
            <Dialog.Close
              aria-label="关闭"
              className="-mr-2 flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-muted)] outline-none transition-colors hover:bg-[var(--hover-bg)] hover:text-[var(--text-primary)] focus-visible:ring-1 focus-visible:ring-[var(--accent-color)]"
            >
              <X aria-hidden="true" className="h-5 w-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description
            className={description ? "px-5 py-6 text-sm leading-6" : "sr-only"}
            style={{ color: "var(--text-secondary)" }}
          >
            {description ?? "请确认是否继续此操作。"}
          </Dialog.Description>

          <div
            className="flex items-center justify-end gap-2 border-t border-[var(--border-color)] px-5 py-4"
            style={{
              backgroundColor:
                "color-mix(in srgb, var(--bg-secondary) 68%, var(--bg-primary))",
            }}
          >
            <Dialog.Close asChild>
              <Button
                ref={cancelButtonRef}
                type="button"
                size="sm"
                variant="outline"
              >
                {cancelText}
              </Button>
            </Dialog.Close>
            <Button
              type="button"
              size="sm"
              variant={isDanger ? "destructive" : "default"}
              onClick={() => void handleConfirm()}
            >
              {confirmText}
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
