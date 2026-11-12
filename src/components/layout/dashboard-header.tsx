import { brand } from "@/config/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export function DashboardHeader() {
  return (
    <header className="flex min-h-16 flex-wrap items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:h-16 sm:flex-nowrap sm:px-6 sm:py-0">
      <div className="flex min-w-0 items-center gap-3">
        <MobileNav />
        <p className="hidden min-w-0 truncate text-sm text-slate-500 sm:block">
          {brand.shortDescription}
        </p>
      </div>
      <SignOutButton />
    </header>
  );
}
