import Link from "next/link";
import { FileText, LayoutDashboard, Settings } from "lucide-react";

import { brand } from "@/config/brand";
import { Separator } from "@/components/ui/separator";

const navigation = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/documents", label: "Documents", icon: FileText },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({
  mobile = false,
  recent,
}: {
  mobile?: boolean;
  /** Server-rendered recent documents, passed down by the server shell. */
  recent?: React.ReactNode;
}) {
  return (
    <aside
      className={
        mobile
          ? "bg-surface flex h-full w-full flex-col"
          : "border-ink-200 bg-surface hidden border-r lg:flex lg:w-64 lg:flex-col"
      }
    >
      <div className="flex h-16 items-center px-5">
        <Link
          href="/dashboard"
          className="flex items-center gap-2.5"
          aria-label={`${brand.name} home`}
        >
          <span className="bg-brand-500 text-ink-950 flex h-8 w-8 items-center justify-center rounded-lg text-sm font-bold">
            A
          </span>
          <span className="text-ink-950 font-semibold tracking-tight">
            {brand.name}
          </span>
        </Link>
      </div>
      <Separator />
      <nav className="space-y-1 p-3" aria-label="Primary navigation">
        {navigation.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="text-ink-600 hover:bg-ink-100 hover:text-ink-950 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors"
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="min-h-0 flex-1 overflow-y-auto">{recent}</div>
      <div className="p-4">
        <p className="text-ink-400 text-xs leading-5">
          {brand.temporaryNotice}
        </p>
      </div>
    </aside>
  );
}
