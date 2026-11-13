import Link from "next/link";
import { FileText, LayoutDashboard, Settings } from "lucide-react";

import { brand } from "@/config/brand";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ mobile = false }: { mobile?: boolean }) {
  return (
    <aside
      className={
        mobile
          ? "flex h-full w-full flex-col bg-surface"
          : "hidden border-r border-ink-200 bg-surface lg:flex lg:w-64 lg:flex-col"
      }
    >
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5"
          aria-label={`${brand.name} home`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-ink-950">
            A
          </span>
          <span className="font-semibold tracking-tight text-ink-950">
            {brand.name}
          </span>
        </Link>
      </div>
      <Separator />
      <nav className="flex-1 space-y-1 p-3" aria-label="Primary navigation">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.744rem] font-medium text-ink-600 transition-colors hover:bg-ink-100 hover:text-ink-950"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="p-4">
        <p className="text-xs leading-5 text-ink-400">
          {brand.temporaryNotice}
        </p>
      </div>
    </aside>
  );
}
