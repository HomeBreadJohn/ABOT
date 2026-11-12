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
          "flex h-11 w-full rounded-lg border border-slate-500 bg-white px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus-visible:border-slate-500 focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 disabled:cursor-not-allowed disabled:opacity-60 aria-invalid:border-rose-600 aria-invalid:ring-rose-200",
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
