import { Dialog } from "@/components/ui/dialog";
import { X } from "lucide-react";
import type { MouseEvent } from "react";

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void | Promise<void>;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "确认",
  cancelText = "取消",
  onConfirm,
}: ConfirmDialogProps) {
  const handleConfirm = async () => {
    await onConfirm();
    onOpenChange(false);
  };

  const stopPortalClick = (event: MouseEvent) => {
    event.stopPropagation();
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-50"
          style={{ backgroundColor: "rgba(0, 0, 0, 0.5)" }}
          onClick={stopPortalClick}
        />
        <Dialog.Content
          className="fixed left-[50%] top-[50%] z-50 w-full max-w-[400px] translate-x-[-50%] translate-y-[-50%] rounded-lg shadow-lg overflow-hidden"
          style={{
            backgroundColor: "var(--bg-secondary)",
          }}
          onClick={stopPortalClick}
        >
          {/* 标题行：左侧标题 + 右侧关闭按钮 */}
          <div
            className="flex items-center justify-between p-4"
            style={{ borderBottom: "1px solid var(--border-color)" }}
          >
            <Dialog.Title
              className="font-medium"
              style={{ color: "var(--text-primary)" }}
            >
              {title}
            </Dialog.Title>
            <Dialog.Close asChild>
              <button className="p-1 rounded-lg transition-colors hover:bg-[var(--hover-bg)]">
                <X className="h-4 w-4" style={{ color: "var(--text-muted)" }} />
              </button>
            </Dialog.Close>
          </div>

          {/* 内容区域 */}
          {description ? (
            <div className="p-4">
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {description}
              </p>
            </div>
          ) : null}

          {/* 按钮区域 */}
          <div
            className="flex items-center justify-end gap-2 p-4"
            style={{ borderTop: "1px solid var(--border-color)" }}
          >
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-1.5 text-sm rounded-md bg-transparent text-[var(--text-primary)] border border-[var(--border-color)] transition-colors hover:bg-[var(--hover-bg)]"
              >
                {cancelText}
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-1.5 text-sm rounded-md bg-[var(--bg-tertiary)] text-[var(--text-primary)] transition-colors hover:bg-[var(--hover-bg)]"
            >
              {confirmText}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
