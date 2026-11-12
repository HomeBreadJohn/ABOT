import Link from "next/link";
import { Plus } from "lucide-react";

import { brand } from "@/config/brand";
import { MobileNav } from "@/components/layout/mobile-nav";

export function MobileTopBar({
  navigation,
}: Readonly<{
  navigation: React.ReactNode;
}>) {
  return (
    <header className="flex h-14 items-center justify-between border-b border-hairline bg-surface px-4 lg:hidden">
      <div className="flex min-w-0 items-center gap-2">
        <MobileNav>{navigation}</MobileNav>
        <Link
          href="/dashboard"
          className="min-w-0 truncate font-semibold tracking-tight text-ink focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
          aria-label={`${brand.name} home`}
        >
          {brand.name}
        </Link>
      </div>
      <Link
        href="/documents/new"
        aria-label="New upload"
        title="New upload"
        className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-accent-ink transition-colors duration-150 ease-standard hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
      >
        <Plus className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </Link>
    </header>
  );
}
