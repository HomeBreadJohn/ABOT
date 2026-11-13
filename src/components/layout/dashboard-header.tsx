import { brand } from "@/config/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export function DashboardHeader({ recent }: { recent?: React.ReactNode }) {
  return (
    <header className="border-ink-200 bg-surface/80 flex h-16 items-center justify-between border-b px-4 backdrop-blur-sm sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav recent={recent} />
        <p className="text-ink-500 text-sm">{brand.shortDescription}</p>
      </div>
      <SignOutButton />
    </header>
  );
}
