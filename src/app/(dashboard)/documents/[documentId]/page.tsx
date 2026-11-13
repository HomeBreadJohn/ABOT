import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import type { DocumentLifecycle } from "@/contracts/common";
import { AnalysisReport } from "@/features/documents/report/analysis-report";
import { ProcessingState } from "@/features/documents/report/processing-state";
import { resolveReportFixture } from "@/features/documents/report/report-fixtures";

/** Lifecycles that already have a report to render. */
const REPORT_READY: ReadonlySet<DocumentLifecycle> = new Set([
  "COMPLETED",
  "NEEDS_CORRECTION",
  "REVIEW_REQUIRED",
  "OCR_PARTIAL",
]);

export default async function DocumentReportPage({
  params,
}: {
  params: Promise<{ documentId: string }>;
}) {
  const { documentId } = await params;
  const fixture = resolveReportFixture(documentId);

  if (!fixture) {
    return (
      <div className="mx-auto max-w-3xl min-w-0">
        <PageHeader
          title="We couldn't find this document"
          description="The document may have been removed, or the link is out of date."
        />
        <EmptyState
          title="Nothing to show here"
          description="Head back to your documents and open one from the list."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl min-w-0">
      <PageHeader
        title={fixture.title}
        description="What this document means for you, with the certainty of each detail shown."
      />
      {REPORT_READY.has(fixture.lifecycle) ? (
        <AnalysisReport
          analysis={fixture.analysis}
          lifecycle={fixture.lifecycle}
        />
      ) : (
        <ProcessingState lifecycle={fixture.lifecycle} />
      )}
    </div>
  );
}
