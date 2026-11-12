import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";

import { cn } from "@/lib/utils";

export interface LabelProps extends React.ComponentPropsWithoutRef<
  typeof LabelPrimitive.Root
> {
  required?: boolean;
}

const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, children, required = false, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn("text-body-sm text-ink font-medium", className)}
    {...props}
  >
    {children}
    {required ? (
      <>
        <span aria-hidden="true"> *</span>
        <span className="sr-only"> (required)</span>
      </>
    ) : null}
  </LabelPrimitive.Root>
));
Label.displayName = LabelPrimitive.Root.displayName;

export { Label };
