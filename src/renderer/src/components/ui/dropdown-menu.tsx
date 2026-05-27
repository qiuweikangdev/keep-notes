import * as React from "react";
import { Check, ChevronRight, Circle } from "lucide-react";
import { cn } from "@/lib/cn";
import { DropdownMenu } from "@/lib/radix";

const DropdownMenuShortcut = ({
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
DropdownMenuShortcut.displayName = "DropdownMenuShortcut";

export { DropdownMenu, DropdownMenuShortcut };
