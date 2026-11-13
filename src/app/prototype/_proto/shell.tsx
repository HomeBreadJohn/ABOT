"use client";

import {
  Bell,
  FolderOpen,
  House,
  Plus,
  RotateCw,
  Settings,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { useStore, type Route } from "./store";
import { BRAND } from "./ui";

type NavItem = { label: string; route: Route; icon: LucideIcon; match: Route["name"][] };

const NAV: NavItem[] = [
  { label: "Home", route: { name: "home" }, icon: House, match: ["home"] },
  {
    label: "Documents",
    route: { name: "vault" },
    icon: FolderOpen,
    match: ["vault", "report", "processing", "correct", "cross"],
  },
  { label: "Reminders", route: { name: "reminders" }, icon: Bell, match: ["reminders"] },
  { label: "Settings", route: { name: "settings" }, icon: Settings, match: ["settings"] },
];

function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
      <rect x="5" y="3" width="20" height="26" rx="3" fill="var(--paper)" stroke="var(--ink)" strokeWidth="2" />
      <rect x="9" y="11" width="12" height="4" rx="1" fill="var(--mark)" />
      <path d="M9 19h9M9 23h6" stroke="var(--ink)" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const { state, dispatch } = useStore();
  const main = useRef<HTMLElement>(null);
  const routeKey = JSON.stringify(state.route);

  useEffect(() => {
    main.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [routeKey]);

  const attention = state.docs.filter((d) =>
    ["NEEDS_CORRECTION", "REVIEW_REQUIRED", "OCR_FAILED", "ANALYSIS_FAILED"].includes(d.lifecycle),
  ).length;

  const go = (route: Route) => dispatch({ type: "go", route });

  return (
    <div className="lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-(--ink) px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-(--line) bg-(--surface) px-4 py-5 lg:flex">
        <button
          type="button"
          onClick={() => go({ name: "home" })}
          className="mb-7 flex items-center gap-2.5 rounded-lg px-2 text-left"
        >
          <Mark />
          <span>
            <span className="block text-xl leading-none font-bold tracking-[-0.02em]">{BRAND}</span>
            <span className="text-sm text-(--ink-3)">Understand before you act</span>
          </span>
        </button>
        <button
          type="button"
          onClick={() => go({ name: "upload" })}
          className="mb-5 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-(--care) px-4 font-semibold text-white hover:bg-(--care-strong)"
        >
          <Plus className="size-5" aria-hidden />
          Add a document
        </button>
        <nav aria-label="Main" className="flex flex-col gap-1">
          {NAV.map((item) => {
            const active = item.match.includes(state.route.name);
            return (
              <button
                key={item.label}
                type="button"
                aria-current={active ? "page" : undefined}
                onClick={() => go(item.route)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-lg px-3 text-left font-semibold text-[0.903rem]",
                  active ? "bg-(--care-wash) text-(--care-strong)" : "text-(--ink-2) hover:bg-(--canvas)",
                )}
              >
                <item.icon className="size-5" aria-hidden />
                {item.label}
                {item.label === "Home" && attention > 0 ? (
                  <span className="ml-auto rounded-full bg-(--critical) px-2 text-sm text-white">
                    {attention}
                  </span>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="mt-auto rounded-xl bg-(--canvas) p-3 text-sm text-(--ink-2)">
          <p className="font-semibold text-(--ink)">Prototype</p>
          <p className="mt-0.5">Sample documents and simulated processing. Nothing is uploaded.</p>
          <button
            type="button"
            onClick={() => dispatch({ type: "reset" })}
            className="mt-2 inline-flex items-center gap-1.5 font-semibold text-(--care-strong) hover:underline"
          >
            <RotateCw className="size-4" aria-hidden />
            Reset demo
          </button>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 flex items-center justify-between border-b border-(--line) bg-(--surface)/95 px-4 py-2.5 backdrop-blur lg:hidden">
          <button type="button" onClick={() => go({ name: "home" })} className="flex items-center gap-2">
            <Mark />
            <span className="text-lg font-bold tracking-[-0.02em]">{BRAND}</span>
          </button>
          <button
            type="button"
            onClick={() => dispatch({ type: "reset" })}
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-(--ink-2)"
          >
            <RotateCw className="size-4" aria-hidden />
            Reset demo
          </button>
        </header>

        <main id="main" ref={main} tabIndex={-1} className="outline-none">
          {children}
        </main>
      </div>

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-(--line) bg-(--surface) pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {NAV.slice(0, 2).map((item) => (
          <TabButton key={item.label} item={item} active={item.match.includes(state.route.name)} onClick={() => go(item.route)} badge={item.label === "Home" ? attention : 0} />
        ))}
        <div className="flex items-center justify-center">
          <button
            type="button"
            aria-label="Add a document"
            onClick={() => go({ name: "upload" })}
            className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-(--care) text-white shadow-[0_6px_16px_-4px_rgb(14_107_98/0.5)]"
          >
            <Plus className="size-7" aria-hidden />
          </button>
        </div>
        {NAV.slice(2).map((item) => (
          <TabButton key={item.label} item={item} active={item.match.includes(state.route.name)} onClick={() => go(item.route)} badge={0} />
        ))}
      </nav>

      {state.toast ? (
        <div
          key={state.toast.id}
          role="status"
          className="sheet-in fixed inset-x-4 bottom-24 z-40 mx-auto max-w-md rounded-xl bg-(--ink) px-4 py-3 text-center font-semibold text-white shadow-lg lg:bottom-8"
        >
          {state.toast.text}
        </div>
      ) : null}
    </div>
  );
}

function TabButton({ item, active, onClick, badge }: { item: NavItem; active: boolean; onClick: () => void; badge: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-16 flex-col items-center justify-center gap-0.5 text-[0.69rem]",
        active ? "font-bold text-(--care-strong)" : "font-semibold text-(--ink-3)",
      )}
    >
      {active ? (
        <span className="absolute top-0 h-1 w-10 rounded-b-full bg-(--care)" aria-hidden />
      ) : null}
      <item.icon className="size-6" strokeWidth={active ? 2.5 : 2} aria-hidden />
      {item.label}
      {badge > 0 ? (
        <span className="absolute top-2 left-[calc(50%+6px)] min-w-5 rounded-full bg-(--critical) px-1.5 text-xs leading-5 text-white">
          {badge}
        </span>
      ) : null}
    </button>
  );
}
