import type { DocumentsDataSource } from "@/features/documents/services/documents-service";

export function SampleDataBanner({
  source,
}: Readonly<{
  source: DocumentsDataSource;
}>) {
  if (source !== "mock") {
    return null;
  }

  return (
    <div
      className="text-body-sm text-ink-muted flex flex-wrap items-center gap-x-3 gap-y-1"
      data-source="mock"
      role="note"
      aria-label="Mock data source"
    >
      <span className="text-ink font-semibold">Sample data</span>
      <span>
        {"You're viewing sample documents. They're examples, not your files."}
      </span>
      <span className="border-tone-informative-border bg-tone-informative-bg text-caption text-tone-informative-fg rounded-full border px-2 py-0.5 font-medium">
        Mock source
      </span>
    </div>
  );
}
