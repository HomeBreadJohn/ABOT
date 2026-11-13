import "server-only";

import { getProviderEnv } from "@/lib/env/server";

/**
 * True only when the document pipeline runs against the mock provider. A
 * misconfigured provider env counts as "not mock" so the banner never claims
 * sample data for a setup that is not clearly in mock mode.
 */
export function isSampleDataMode(): boolean {
  try {
    return getProviderEnv().mode === "mock";
  } catch {
    return false;
  }
}

/**
 * Server Component. It reads the server env itself, so the env module is never
 * imported by a client component.
 */
export function SampleDataBanner() {
  if (!isSampleDataMode()) {
    return null;
  }

  return (
    <div
      className="border-ink-200 bg-brand-50 text-ink-700 flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2 text-sm sm:px-6"
      data-source="mock"
      role="note"
      aria-label="Sample data notice"
    >
      <span className="text-ink-950 font-semibold">Sample data</span>
      <span>
        Documents are analysed with sample data, so the results are examples and
        not a real reading of your file.
      </span>
    </div>
  );
}
