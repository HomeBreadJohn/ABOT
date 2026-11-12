import { FileText, LayoutDashboard, Plus } from "lucide-react";
import Link from "next/link";

import { AccountMenu } from "@/components/layout/account-menu";
import { RecentDocumentsNav, type RecentDocumentNavItem } from "@/components/layout/recent-documents-nav";
import { SidebarNavLink } from "@/components/layout/sidebar-nav-link";
import { brand } from "@/config/brand";

const navigation = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
] as const;

export function Sidebar({
  recentDocuments,
  displayName,
  id = "sidebar-navigation",
  instanceId = "desktop",
}: Readonly<{
  recentDocuments?: readonly RecentDocumentNavItem[];
  displayName?: string | null;
  id?: string;
  instanceId?: string;
}>) {
  return (
    <aside
      id={id}
      className="sidebar-content flex min-h-0 w-full flex-1 flex-col bg-surface-sunken"
    >
      <div className="sidebar-brand-row flex h-16 shrink-0 items-center px-4">
        <Link
          href="/dashboard"
          className="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
          aria-label={`${brand.name} home`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-accent text-sm font-semibold text-on-accent">
            {brand.name.slice(0, 1).toUpperCase()}
          </span>
          <span className="sidebar-label min-w-0 truncate font-semibold tracking-tight text-ink">
            {brand.name}
          </span>
        </Link>
      </div>

      <div className="px-3 pb-3">
        <Link
          href="/documents/new"
          className="flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-3 text-body-sm font-medium text-on-accent transition-colors duration-150 ease-standard hover:bg-accent-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
          title="New upload"
        >
          <Plus className="h-5 w-5 shrink-0" strokeWidth={1.75} aria-hidden="true" />
          <span className="sidebar-label">New upload</span>
        </Link>
      </div>

      <nav className="space-y-1 px-3" aria-label="Primary navigation">
        {navigation.map(({ href, label, icon }) => (
          <SidebarNavLink key={href} href={href} label={label} icon={icon} />
        ))}
      </nav>

      <RecentDocumentsNav documents={recentDocuments} />
      <AccountMenu displayName={displayName} idSuffix={instanceId} />
    </aside>
  );
}
