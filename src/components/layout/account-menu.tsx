"use client";

import { ChevronDown, Settings } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

import { SignOutButton } from "@/components/shared/sign-out-button";

export function AccountMenu({
  displayName,
  idSuffix = "default",
}: Readonly<{
  displayName?: string | null;
  idSuffix?: string;
}>) {
  const [open, setOpen] = useState(false);
  const accountMenuId = `account-menu-panel-${idSuffix}`;
  const label = displayName?.trim() || "Account";
  const initial = label.slice(0, 1).toUpperCase();

  return (
    <div className="sidebar-account border-t border-hairline p-3">
      <button
        type="button"
        className="flex min-h-11 w-full items-center gap-3 rounded-md px-3 text-left text-body-sm transition-colors duration-150 ease-standard hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
        aria-expanded={open}
        aria-controls={accountMenuId}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-caption font-semibold text-accent-ink">
          {initial}
        </span>
        <span className="sidebar-label min-w-0 flex-1 truncate font-medium text-ink">
          {label}
        </span>
        <ChevronDown
          className={`sidebar-label h-4 w-4 shrink-0 text-ink-subtle transition-transform duration-150 ease-standard ${open ? "rotate-180" : ""}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div id={accountMenuId} className="sidebar-account-menu mt-2 space-y-1 rounded-md bg-surface p-2 shadow-soft">
          <Link
            href="/settings"
            className="flex min-h-11 items-center gap-3 rounded-md px-3 text-body-sm text-ink-muted transition-colors duration-150 ease-standard hover:bg-surface-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
            onClick={() => setOpen(false)}
          >
            <Settings className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Settings
          </Link>
          <div className="px-3 py-1">
            <SignOutButton />
          </div>
        </div>
      ) : null}
    </div>
  );
}
