import { brand } from "@/config/brand";
import { MobileNav } from "@/components/layout/mobile-nav";
import { SignOutButton } from "@/components/shared/sign-out-button";

export function DashboardHeader() {
  return (
    <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
      <div className="flex items-center gap-3">
        <MobileNav />
        <p className="text-sm text-slate-500">{brand.shortDescription}</p>
      </div>
      <SignOutButton />
    </header>
  );
}
