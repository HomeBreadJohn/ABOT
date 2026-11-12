"use client";

import { FileText, LayoutDashboard, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Icons are resolved on the client side of the boundary: a Server Component
// cannot pass a Lucide component (a forwardRef object with a render method)
// as a prop, so the sidebar passes a serializable key instead.
export type SidebarNavIcon = "home" | "documents";

const NAV_ICONS: Record<SidebarNavIcon, LucideIcon> = {
  home: LayoutDashboard,
  documents: FileText,
};

interface SidebarNavLinkProps {
  href: string;
  label: string;
  icon: SidebarNavIcon;
}

function isCurrentPath(pathname: string | null, href: string) {
  if (!pathname) {
    return false;
  }

  return pathname === href || (href !== "/dashboard" && pathname.startsWith(`${href}/`));
}

export function SidebarNavLink({ href, label, icon }: SidebarNavLinkProps) {
  const pathname = usePathname();
  const current = isCurrentPath(pathname, href);
  const Icon = NAV_ICONS[icon];

  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      title={label}
      className={`sidebar-nav-link flex min-h-11 items-center gap-3 rounded-md border-l-3 px-3 text-body-sm font-medium transition-colors duration-150 ease-standard focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus ${
        current
          ? "border-accent bg-surface-hover text-ink"
          : "border-transparent text-ink-muted hover:bg-surface-hover hover:text-ink"
      }`}
    >
      <Icon className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="sidebar-label min-w-0 truncate">{label}</span>
    </Link>
  );
}
