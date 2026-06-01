import * as React from "react";
import { cn } from "@/lib/cn";
import { ContextMenu } from "@/lib/radix";

const ContextMenuShortcut = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLSpanElement>) => {
  return (
    <span
      className={cn("ml-auto text-xs tracking-widest opacity-60", className)}
      {...props}
    />
  );
};
ContextMenuShortcut.displayName = "ContextMenuShortcut";

export { ContextMenu, ContextMenuShortcut };
