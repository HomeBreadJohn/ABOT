import Link from "next/link";

import { brand } from "@/config/brand";

export default function AuthLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <main className="flex min-h-screen flex-col bg-background">
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        {children}
      </div>
      <footer className="px-6 py-6 text-center text-xs text-ink-400">
        <Link href="/">{brand.name}</Link> · {brand.temporaryNotice}
      </footer>
    </main>
  );
}
