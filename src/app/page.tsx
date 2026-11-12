import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background">
      <header className="border-b border-ink-100">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link
            href="/"
            className="font-semibold tracking-tight text-ink-950"
          >
            {brand.name}
          </Link>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Sign in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/register">Get started</Link>
            </Button>
          </div>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
        <div>
          <p className="mb-6 inline-flex items-center gap-2 rounded-full bg-brand-50 px-3 py-1.5 text-sm font-medium text-brand-800">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> A calmer way to
            work with documents
          </p>
          <h1 className="max-w-2xl text-5xl font-semibold tracking-tight text-ink-950 sm:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-ink-500">
            {brand.shortDescription} Upload, organize, and prepare to get useful
            guidance when the product workflows are ready.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg">
              <Link href="/register">
                Create a workspace{" "}
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </Button>
            <Button asChild variant="secondary" size="lg">
              <Link href="/login">Sign in</Link>
            </Button>
          </div>
        </div>
        <div className="rounded-3xl border border-ink-200 bg-ink-100/60 p-6 sm:p-8">
          <div className="rounded-2xl border border-ink-200 bg-surface p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-100 text-brand-800">
                <FileText className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-medium text-ink-950">
                  Your document workspace
                </p>
                <p className="text-sm text-ink-500">A focused place to begin</p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-3 w-4/5 rounded-full bg-ink-100" />
              <div className="h-3 w-3/5 rounded-full bg-ink-100" />
              <div className="h-24 rounded-xl border border-dashed border-ink-300 bg-ink-50" />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-ink-500">
            <ShieldCheck
              className="h-4 w-4 text-success"
              aria-hidden="true"
            />{" "}
            Private by default, with access controls built in.
          </div>
        </div>
      </section>
    </main>
  );
}
