import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-md text-body-sm font-medium transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-accent text-on-accent hover:bg-accent-hover",
        secondary:
          "border border-strong bg-surface text-ink hover:bg-surface-hover",
        ghost: "text-ink-muted hover:bg-surface-hover hover:text-ink",
        danger:
          "bg-tone-critical-fg text-on-accent hover:bg-tone-critical-fg/90",
      },
      size: {
        sm: "h-11 px-3",
        md: "h-11 px-4",
        lg: "h-11 px-5",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

export interface ButtonProps
  extends
    React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  pending?: boolean;
  pendingLabel?: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      children,
      className,
      variant,
      size,
      asChild = false,
      disabled = false,
      pending = false,
      pendingLabel = "Please wait…",
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";
    const isDisabled = disabled || pending;

    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        aria-busy={pending || undefined}
        aria-disabled={asChild && isDisabled ? true : undefined}
        data-pending={pending ? "" : undefined}
        disabled={!asChild && isDisabled ? true : undefined}
        {...props}
      >
        {pending ? (
          <>
            <span
              aria-hidden="true"
              className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent"
            />
            <span>{pendingLabel}</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
