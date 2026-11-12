import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
  pending?: boolean;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className,
      type,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      descriptionId,
      errorId,
      invalid,
      pending = false,
      disabled = false,
      ...props
    },
    ref,
  ) => {
    const describedBy = [ariaDescribedBy, descriptionId, errorId]
      .filter(Boolean)
      .filter((id, index, ids) => ids.indexOf(id) === index)
      .join(" ");
    const isDisabled = disabled || pending;

    return (
      <input
        type={type}
        className={cn(
          "border-strong bg-surface text-body text-ink placeholder:text-ink-muted ease-standard focus-visible:outline-focus aria-invalid:border-tone-critical-border flex h-11 w-full rounded-md border px-3 py-2 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        ref={ref}
        aria-busy={pending || undefined}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid ?? ariaInvalid}
        disabled={isDisabled}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
