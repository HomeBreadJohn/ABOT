"use client";

import {
  ChevronLeft,
  OctagonExclamationPoint,
  CircleCheck,
  CircleQuestionMark,
  Info,
  Scale,
  Search,
  TriangleExclamationPoint,
  type LucideIcon,
} from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import type { Finding } from "@/contracts/analysis";
import type { InformationStatus, Severity } from "@/contracts/common";
import { cn } from "@/lib/utils";

import { STATUS_LABEL } from "./data";
import { useStore } from "./store";

export const BRAND = "ABOT";

type BtnVariant = "primary" | "secondary" | "ghost" | "danger" | "mark";

export function Btn({
  variant = "secondary",
  size = "md",
  icon: Icon,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: BtnVariant;
  size?: "sm" | "md" | "lg";
  icon?: LucideIcon;
}) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-[background-color,box-shadow,transform] duration-150 active:translate-y-px disabled:cursor-not-allowed disabled:opacity-45",
        size === "sm" && "min-h-10 px-3 text-[0.9375rem]",
        size === "md" && "min-h-12 px-4",
        size === "lg" && "min-h-14 px-5 text-lg",
        variant === "primary" &&
          "bg-(--care) text-white hover:bg-(--care-strong)",
        variant === "secondary" &&
          "lift border border-(--line-2) bg-(--surface) text-(--ink) hover:bg-(--canvas)",
        variant === "ghost" &&
          "text-(--care-strong) hover:bg-(--care-wash)",
        variant === "danger" &&
          "bg-(--critical) text-white hover:bg-[#912018]",
        variant === "mark" &&
          "bg-(--mark) text-(--ink) hover:bg-(--mark-strong)",
        className,
      )}
      {...props}
    >
      {Icon ? <Icon className="size-5 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

export function BackBar({ label = "Back" }: { label?: string }) {
  const { dispatch } = useStore();
  return (
    <button
      type="button"
      onClick={() => dispatch({ type: "back" })}
      className="-ml-2 mb-3 inline-flex min-h-10 items-center gap-1 rounded-lg px-2 font-semibold text-(--care-strong) hover:bg-(--care-wash)"
    >
      <ChevronLeft className="size-5" aria-hidden />
      {label}
    </button>
  );
}

export function Screen({
  title,
  lead,
  back,
  actions,
  children,
}: {
  title: ReactNode;
  lead?: ReactNode;
  back?: boolean;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 pt-5 pb-28 sm:px-6 lg:pb-12">
      {back ? <BackBar /> : null}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[1.75rem] leading-tight font-bold tracking-[-0.02em] text-balance sm:text-[2rem]">
            {title}
          </h1>
          {lead ? (
            <p className="mt-1.5 max-w-[60ch] text-(--ink-2)">{lead}</p>
          ) : null}
        </div>
        {actions}
      </div>
      {children}
    </div>
  );
}

export function SectionHeading({
  children,
  count,
  action,
}: {
  children: ReactNode;
  count?: number;
  action?: ReactNode;
}) {
  return (
    <div className="mt-9 mb-3 flex items-baseline justify-between gap-3 first:mt-0">
      <h2 className="text-xl font-bold tracking-[-0.01em]">
        {children}
        {count !== undefined ? (
          <span className="ml-2 font-semibold text-(--ink-3)">{count}</span>
        ) : null}
      </h2>
      {action}
    </div>
  );
}

const SEVERITY: Record<
  Severity,
  { label: string; fg: string; bg: string; icon: LucideIcon }
> = {
  CRITICAL: {
    label: "Act now",
    fg: "text-(--critical)",
    bg: "bg-(--critical-wash)",
    icon: OctagonExclamationPoint,
  },
  HIGH: {
    label: "Important",
    fg: "text-(--high)",
    bg: "bg-(--high-wash)",
    icon: TriangleExclamationPoint,
  },
  MEDIUM: {
    label: "Worth checking",
    fg: "text-(--medium)",
    bg: "bg-(--medium-wash)",
    icon: Info,
  },
  LOW: {
    label: "Good to know",
    fg: "text-(--low)",
    bg: "bg-(--low-wash)",
    icon: Info,
  },
};

export function SeverityTag({ severity }: { severity: Severity }) {
  const s = SEVERITY[severity];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold",
        s.fg,
        s.bg,
      )}
    >
      <s.icon className="size-4" aria-hidden />
      {s.label}
    </span>
  );
}

export function severityRank(s?: Severity): number {
  return s ? ["CRITICAL", "HIGH", "MEDIUM", "LOW"].indexOf(s) : 4;
}

const STATUS_ICON: Record<InformationStatus, LucideIcon> = {
  FOUND: CircleCheck,
  NOT_FOUND: Search,
  UNCLEAR: CircleQuestionMark,
  CONFLICTING: Scale,
  INFERRED: CircleQuestionMark,
};

/** Fact vs interpretation is shown in words and shape, never by colour alone. */
export function StatusTag({ status }: { status: InformationStatus }) {
  const Icon = STATUS_ICON[status];
  const inferred = status === "INFERRED";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-medium",
        status === "FOUND" && "bg-(--care-wash) text-(--care-strong)",
        inferred && "border border-dashed border-(--ink-3) text-(--ink-2)",
        status === "NOT_FOUND" && "bg-(--low-wash) text-(--ink-2)",
        (status === "UNCLEAR" || status === "CONFLICTING") &&
          "bg-(--medium-wash) text-(--medium)",
      )}
    >
      <Icon className="size-4" aria-hidden />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function confidenceWords(c: number): string {
  if (c >= 0.85) return "High confidence";
  if (c >= 0.6) return "Medium confidence";
  return "Low confidence";
}

export function Meta({ finding }: { finding: Pick<Finding, "informationStatus" | "confidence"> }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <StatusTag status={finding.informationStatus} />
      <span className="text-sm text-(--ink-3)">
        {confidenceWords(finding.confidence)} ({Math.round(finding.confidence * 100)}%)
      </span>
    </div>
  );
}

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "lift rounded-2xl border border-(--line) bg-(--surface)",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Callout({
  tone,
  icon: Icon,
  title,
  children,
  action,
}: {
  tone: "critical" | "high" | "medium" | "care" | "low";
  icon: LucideIcon;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role={tone === "critical" ? "alert" : undefined}
      className={cn(
        "flex flex-col gap-3 rounded-2xl p-4 sm:flex-row sm:items-start",
        tone === "critical" && "bg-(--critical-wash) text-(--critical)",
        tone === "high" && "bg-(--high-wash) text-(--high)",
        tone === "medium" && "bg-(--medium-wash) text-(--medium)",
        tone === "care" && "bg-(--care-wash) text-(--care-strong)",
        tone === "low" && "bg-(--low-wash) text-(--ink-2)",
      )}
    >
      <Icon className="mt-0.5 size-6 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="font-bold">{title}</p>
        {children ? <div className="mt-1 text-(--ink)">{children}</div> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded-xl border border-(--line-2) bg-(--surface) p-1"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-10 rounded-lg px-3 text-[0.9375rem] font-semibold transition-colors",
            value === o.value
              ? "bg-(--ink) text-white"
              : "text-(--ink-2) hover:bg-(--canvas)",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-(--line-2) px-5 py-8 text-center">
      <Icon className="mx-auto size-8 text-(--ink-3)" aria-hidden />
      <p className="mt-2 font-semibold">{title}</p>
      {children ? <div className="mt-1 text-(--ink-2)">{children}</div> : null}
    </div>
  );
}
