import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { Dialog } from "@/lib/radix";

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className,
    )}
    {...props}
  />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className,
    )}
    {...props}
  />
);
DialogFooter.displayName = "DialogFooter";

interface DialogContentProps
  extends React.ComponentPropsWithoutRef<typeof Dialog.Content> {
  showCloseButton?: boolean;
}

const DialogContent = React.forwardRef<
  React.ElementRef<typeof Dialog.Content>,
  DialogContentProps
>(({ className, children, showCloseButton = true, ...props }, ref) => (
  <Dialog.Portal>
    <Dialog.Overlay
      className="fixed inset-0 z-50"
      style={{ backgroundColor: "rgba(0, 0, 0, 0.4)" }}
    />
    <Dialog.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 p-6 shadow-lg duration-200 sm:rounded-lg",
        className,
      )}
      style={{
        backgroundColor: "var(--bg-primary)",
        border: "1px solid var(--border-color)",
        color: "var(--text-primary)",
      }}
      {...props}
    >
      {children}
      {showCloseButton ? (
        <Dialog.Close
          className="absolute right-4 top-4 rounded-sm opacity-70 transition-opacity hover:opacity-100 focus:outline-none"
          style={{ color: "var(--text-muted)" }}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">关闭</span>
        </Dialog.Close>
      ) : null}
    </Dialog.Content>
  </Dialog.Portal>
));
DialogContent.displayName = "DialogContent";

export { Dialog, DialogContent, DialogHeader, DialogFooter };
