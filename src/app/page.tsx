import Link from "next/link";
import { ArrowRight, FileText, ShieldCheck, Sparkles } from "lucide-react";

import { brand } from "@/config/brand";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="min-h-screen min-w-0 bg-white">
      <header className="border-b border-slate-100">
        <div className="mx-auto max-w-6xl px-4 py-4 sm:px-6 sm:py-5">
          <nav
            className="flex min-w-0 flex-wrap items-center justify-between gap-3"
            aria-label="Public navigation"
          >
            <Link
              href="/"
              className="min-w-0 truncate font-semibold tracking-tight text-slate-950"
            >
              {brand.name}
            </Link>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button asChild variant="ghost" size="sm">
                <Link href="/login">Sign in</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/register">Get started</Link>
              </Button>
            </div>
          </nav>
        </div>
      </header>
      <section className="mx-auto grid max-w-6xl min-w-0 gap-10 px-4 py-16 sm:gap-12 sm:px-6 sm:py-20 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
        <div>
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-600">
            <Sparkles className="h-4 w-4" aria-hidden="true" /> A calmer way to
            work with documents
          </p>
          <h1 className="max-w-2xl text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl lg:text-6xl">
            {brand.tagline}
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-500">
            {brand.shortDescription} Upload a document and ABOT reads it,
            explains it in plain language, and shows you the evidence behind
            every finding.
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
        <div className="min-w-0 rounded-3xl border border-slate-200 bg-slate-50 p-4 sm:p-8">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100">
                <FileText
                  className="h-5 w-5 text-slate-700"
                  aria-hidden="true"
                />
              </div>
              <div>
                <p className="font-medium text-slate-950">
                  Your document workspace
                </p>
                <p className="text-sm text-slate-500">
                  A focused place to begin
                </p>
              </div>
            </div>
            <div className="mt-6 space-y-3">
              <div className="h-3 w-4/5 rounded-full bg-slate-100" />
              <div className="h-3 w-3/5 rounded-full bg-slate-100" />
              <div className="h-24 rounded-xl border border-dashed border-slate-200 bg-slate-50" />
            </div>
          </div>
          <div className="mt-5 flex items-center gap-2 text-sm text-slate-500">
            <ShieldCheck
              className="h-4 w-4 text-emerald-600"
              aria-hidden="true"
            />{" "}
            Private by default, with access controls built in.
          </div>
        </div>
      </section>
    </main>
  );
}
