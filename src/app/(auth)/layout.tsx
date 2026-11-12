import Link from "next/link";

import { brand } from "@/config/brand";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-slate-50">
      <div className="flex min-w-0 flex-1 items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        {children}
      </div>
      <footer className="px-4 py-5 text-center text-xs text-slate-600 sm:px-6 sm:py-6">
        <Link
          href="/"
          className="rounded-sm focus-visible:ring-2 focus-visible:ring-slate-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-950 focus-visible:outline-none"
        >
          {brand.name}
        </Link>{" "}
        · {brand.temporaryNotice}
      </footer>
    </div>
  );
}
