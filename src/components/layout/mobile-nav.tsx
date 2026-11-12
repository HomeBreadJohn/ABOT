"use client";

import { useEffect, useRef, useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/sidebar";

const mobileNavigationPanelId = "mobile-navigation-panel";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpenRef = useRef(false);

  useEffect(() => {
    if (!open) {
      if (!wasOpenRef.current) {
        return;
      }

      wasOpenRef.current = false;
      const frame = window.requestAnimationFrame(() => {
        triggerRef.current?.focus();
      });

      return () => window.cancelAnimationFrame(frame);
    }

    wasOpenRef.current = true;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        setOpen(false);
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
        aria-controls={mobileNavigationPanelId}
        aria-expanded={open}
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
          id={mobileNavigationPanelId}
          className="fixed inset-0 z-50 flex flex-col overflow-y-auto bg-white"
        >
          <div className="flex h-16 shrink-0 items-center justify-end border-b border-slate-200 px-4">
            <Button
              variant="ghost"
              size="sm"
              aria-label="Close navigation"
              onClick={() => setOpen(false)}
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
