import Link from "next/link";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex min-h-screen min-w-0 items-center justify-center bg-slate-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-md text-center">
        <p className="text-sm font-medium text-slate-500">{brand.name}</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">
          Page not found
        </h1>
        <p className="mt-3 text-slate-500">
          The page you requested does not exist.
        </p>
        <nav aria-label="Fallback navigation">
          <Button asChild className="mt-6">
            <Link href="/">Return home</Link>
          </Button>
        </nav>
      </div>
    </main>
  );
}
