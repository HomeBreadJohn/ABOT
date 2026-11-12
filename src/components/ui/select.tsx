import * as React from "react";

import { cn } from "@/lib/utils";

export interface SelectProps extends React.ComponentPropsWithoutRef<"select"> {
  label?: React.ReactNode;
  descriptionId?: string;
  errorId?: string;
  invalid?: boolean;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  (
    {
      className,
      id,
      label,
      "aria-describedby": ariaDescribedBy,
      "aria-invalid": ariaInvalid,
      "aria-label": ariaLabel,
      "aria-labelledby": ariaLabelledBy,
      descriptionId,
      errorId,
      invalid,
      ...props
    },
    ref,
  ) => {
    const generatedId = React.useId();
    const selectId = id ?? `select-${generatedId}`;
    const describedBy = [ariaDescribedBy, descriptionId, errorId]
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index)
      .join(" ");
    const accessibleLabel =
      ariaLabel ?? (ariaLabelledBy || label ? undefined : "Select");
    const select = (
      <select
        id={selectId}
        ref={ref}
        className={cn(
          "border-strong bg-surface text-body text-ink ease-standard focus-visible:outline-focus aria-invalid:border-tone-critical-border h-11 w-full rounded-md border px-3 py-2 transition-colors duration-150 outline-none focus-visible:outline-2 focus-visible:outline-offset-3 disabled:cursor-not-allowed disabled:opacity-60",
          className,
        )}
        aria-describedby={describedBy || undefined}
        aria-invalid={invalid ?? ariaInvalid}
        aria-label={accessibleLabel}
        aria-labelledby={ariaLabelledBy}
        {...props}
      />
    );

    return label ? (
      <div className="grid gap-1.5">
        <label htmlFor={selectId} className="text-body-sm text-ink font-medium">
          {label}
        </label>
        {select}
      </div>
    ) : (
      select
    );
  },
);
Select.displayName = "Select";

export { Select };
