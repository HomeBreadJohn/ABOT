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
          ? "flex min-h-0 w-full flex-1 flex-col bg-white"
          : "hidden border-r border-slate-200 bg-white lg:flex lg:w-64 lg:flex-col"
      }
    >
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5 rounded-lg focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 focus-visible:outline-none"
          aria-label={`${brand.name} home`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-950 text-sm font-semibold text-white">
            D
          </span>
          <span className="font-semibold tracking-tight text-slate-950">
            {brand.name}
          </span>
        </Link>
      </div>
      <Separator />
      <nav
        className="flex-1 space-y-1 p-3"
        aria-label={mobile ? "Mobile navigation" : "Primary navigation"}
      >
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-950 focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 focus-visible:outline-none"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="max-w-xs p-4 sm:max-w-sm">
        <p className="text-xs leading-5 text-slate-600">
          {brand.temporaryNotice}
        </p>
      </div>
    </aside>
  );
}
