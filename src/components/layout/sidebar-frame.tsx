"use client";

import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useState } from "react";

import { serializeSidebarStateCookie } from "@/components/layout/sidebar-state";

const sidebarNavigationId = "sidebar-navigation";

function persistSidebarState(collapsed: boolean) {
  document.cookie = serializeSidebarStateCookie(
    collapsed ? "collapsed" : "expanded",
  );
}

export function SidebarFrame({
  children,
  initialCollapsed = false,
}: Readonly<{
  children: React.ReactNode;
  initialCollapsed?: boolean;
}>) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  function toggleSidebar() {
    setCollapsed((current) => {
      const next = !current;
      persistSidebarState(next);
      return next;
    });
  }

  return (
    <div
      className="sidebar-frame ease-standard relative hidden shrink-0 transition-[width] duration-200 lg:flex lg:w-68"
      data-collapsed={collapsed}
    >
      <button
        type="button"
        className="text-ink-muted ease-standard hover:bg-surface-hover hover:text-ink focus-visible:outline-focus absolute top-4 right-3 z-10 inline-flex h-11 w-11 items-center justify-center rounded-md transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-3"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        aria-controls={sidebarNavigationId}
        aria-expanded={!collapsed}
        title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        onClick={toggleSidebar}
      >
        {collapsed ? (
          <PanelLeftOpen
            className="h-5 w-5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        ) : (
          <PanelLeftClose
            className="h-5 w-5"
            strokeWidth={1.75}
            aria-hidden="true"
          />
        )}
      </button>
      {children}
    </div>
  );
}
