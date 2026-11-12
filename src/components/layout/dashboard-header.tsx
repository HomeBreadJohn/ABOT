import { brand } from "@/config/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export function DashboardHeader() {
  return (
    <header className="border-hairline bg-surface/80 flex min-h-16 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 backdrop-blur-sm sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav />
        <p className="text-body-sm text-ink-muted hidden min-w-0 truncate sm:block">
          {brand.shortDescription}
        </p>
      </div>
      <SignOutButton />
    </header>
  );
}
