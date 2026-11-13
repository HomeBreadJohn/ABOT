"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/sidebar";

const MOBILE_NAV_DRAWER_ID = "mobile-nav-drawer";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeNavigation = () => setOpen(false);

  // Dismiss on Escape and return focus to the trigger so keyboard users aren't stranded.
  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeNavigation();
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <div className="lg:hidden">
      <Button
        ref={triggerRef}
        variant="ghost"
        size="sm"
        aria-label={open ? "Close navigation" : "Open navigation"}
        aria-expanded={open}
        aria-controls={MOBILE_NAV_DRAWER_ID}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </Button>
      {open ? (
        <div
          id={MOBILE_NAV_DRAWER_ID}
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 bg-surface"
        >
          <div className="flex h-16 items-center justify-end border-b border-ink-200 px-4">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close navigation"
              onClick={closeNavigation}
            >
              <X className="h-5 w-5" aria-hidden="true" />
            </Button>
          </div>
          <Sidebar mobile />
        </div>
      ) : null}
    </div>
  );
}
