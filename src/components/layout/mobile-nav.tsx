"use client";

import { useState } from "react";
import { Menu, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sidebar } from "@/components/layout/sidebar";

export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <div className="lg:hidden">
      <Button
        variant="ghost"
        size="sm"
        aria-label={open ? "Close navigation" : "Open navigation"}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? (
          <X className="h-5 w-5" aria-hidden="true" />
        ) : (
          <Menu className="h-5 w-5" aria-hidden="true" />
        )}
      </Button>
      {open ? (
        <div className="fixed inset-0 z-50 bg-white">
          <div className="flex h-16 items-center justify-end border-b border-slate-200 px-4">
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
