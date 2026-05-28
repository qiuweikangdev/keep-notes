import * as React from "react";
import { cn } from "@/lib/cn";
import { Label } from "@/lib/radix";

const LabelComponent = React.forwardRef<
  React.ElementRef<typeof Label.Root>,
  React.ComponentPropsWithoutRef<typeof Label.Root>
>(({ className, ...props }, ref) => (
  <Label.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",
      className,
    )}
    style={{
      color: "var(--text-primary)",
    }}
    {...props}
  />
));
LabelComponent.displayName = "Label";

export { LabelComponent as Label };
