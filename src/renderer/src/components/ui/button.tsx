import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";
import { Slot } from "@/lib/radix";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "",
        destructive: "",
        outline: "",
        secondary: "",
        ghost: "",
        link: "",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, style, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    const getVariantStyles = () => {
      switch (variant) {
        case "default":
          return {
            backgroundColor: "var(--accent-color)",
            color: "#ffffff",
          };
        case "destructive":
          return {
            backgroundColor: "#ff4d4f",
            color: "#ffffff",
          };
        case "outline":
          return {
            backgroundColor: "transparent",
            border: "1px solid var(--border-color)",
            color: "var(--text-primary)",
          };
        case "secondary":
          return {
            backgroundColor: "var(--bg-secondary)",
            color: "var(--text-primary)",
          };
        case "ghost":
          return {
            backgroundColor: "transparent",
            color: "var(--text-primary)",
          };
        case "link":
          return {
            backgroundColor: "transparent",
            color: "var(--accent-color)",
            textDecoration: "underline",
            textUnderlineOffset: "4px",
          };
        default:
          return {
            backgroundColor: "var(--accent-color)",
            color: "#ffffff",
          };
      }
    };

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        style={{
          ...getVariantStyles(),
          ...style,
        }}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
