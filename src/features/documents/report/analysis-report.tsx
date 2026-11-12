"use client";

import { useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { FormMessage } from "@/components/ui/form-message";
import { PresentationValue } from "@/components/ui/presentation-value";
import { StatusPill } from "@/components/ui/status-pill";
import { StatusShape } from "@/components/ui/status-shape";
import type {
  AnalysisResult,
  EvidenceReference,
  Finding,
} from "@/contracts";
import type { DocumentLifecycle } from "@/contracts/common";
import { bucketConfidence } from "@/features/documents/report/bucket-confidence";
import { CorrectionPanel } from "@/features/documents/report/correction-panel";
import { FindingItem } from "@/features/documents/report/finding-item";
import { presentCategory, presentDocumentStatus } from "@/features/documents/view-models";
import { cn } from "@/lib/utils";

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4">
      <h2 className="text-subhead text-ink border-hairline border-b pb-2 tracking-tight">
        {title}
      </h2>
      {children}
    </section>
  );
}

function FindingList({
  findings,
  evidence,
}: {
  findings: readonly Finding[];
  evidence: readonly EvidenceReference[];
}) {
  return (
    <div className="grid gap-4">
      {findings.map((finding) => (
        <FindingItem key={finding.id} finding={finding} evidence={evidence} />
      ))}
    </div>
  );
}

const GENERATED_FORMATTER = new Intl.DateTimeFormat("en-PH", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "Asia/Manila",
});

function formatGenerated(iso: string): string {
  const parsed = new Date(iso);
  return Number.isNaN(parsed.getTime())
    ? iso
    : GENERATED_FORMATTER.format(parsed);
}

export function AnalysisReport({
  analysis,
  lifecycle,
}: {
  analysis: AnalysisResult;
  lifecycle: DocumentLifecycle;
}) {
  // Local correction state for the single REQUIRED review item (mock flow).
  const [correction, setCorrection] = useState<{ value: string } | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  const { document } = analysis;
  const category = presentCategory(document.documentType);
  const status = presentDocumentStatus(lifecycle);
  const title = document.documentSubtype ?? document.documentType;

  const requiredReview = analysis.reviewRequirements.find(
    (item) => item.reviewStatus === "REQUIRED",
  );
  const hasRequiredReview = requiredReview !== undefined;
  const resolved = correction !== null;

  const showTrustBanner = lifecycle === "NEEDS_CORRECTION" || hasRequiredReview;
  const isPartial = analysis.analysisMetadata.partial;

  // Apply the mock correction: the finding reads FOUND and gains a
  // USER_CORRECTION evidence entry so the report reflects the fixed value.
  const correctedEvidenceId = "user-correction-1";
  const evidence: readonly EvidenceReference[] = resolved
    ? [
        ...analysis.evidence,
        {
          id: correctedEvidenceId,
          documentId: document.documentId,
          pageNumber: requiredReview?.pageNumber ?? 1,
          excerpt: `${requiredReview?.field ?? "Value"}: ${correction.value}`,
          sourceType: "USER_CORRECTION" as const,
        },
      ]
    : analysis.evidence;

  function applyFinding(finding: Finding): Finding {
    if (!resolved || finding.id !== requiredReview?.findingId) {
      return finding;
    }
    return {
      ...finding,
      informationStatus: "FOUND",
      confidence: 0.99,
      explanation: `You confirmed this value: ${correction?.value}.`,
      evidenceIds: [...finding.evidenceIds, correctedEvidenceId],
    };
  }

  const keyInformation = analysis.keyInformation.map(applyFinding);

  function handleSave(value: string) {
    setCorrection({ value });
    setPanelOpen(false);
  }

  return (
    <article className="grid gap-8">
      <header className="border-hairline bg-surface shadow-soft grid gap-3 rounded-lg border p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <h1 className="text-title text-ink tracking-tight text-balance">
            {title}
          </h1>
          <StatusPill
            tone={status.tone}
            label={status.label}
            className="mt-0.5 shrink-0"
          />
        </div>
        {document.issuer ? (
          <p className="text-body text-ink-muted">From {document.issuer}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="neutral">{category.label}</Badge>
          <span className="text-caption text-ink-subtle">
            Sorted with {bucketConfidence(document.classificationConfidence)}{" "}
            confidence
          </span>
        </div>
      </header>

      {showTrustBanner ? (
        <Card
          role="region"
          aria-label="Please check this report"
          className="border-tone-caution-border bg-tone-caution-bg/40 border-l-4"
        >
          <CardContent className="flex gap-3 pt-4 sm:pt-5">
            <StatusShape
              tone="caution"
              size="md"
              className="text-tone-caution-fg mt-0.5 shrink-0"
              label="Caution"
            />
            <div className="grid gap-2">
              <p className="text-body text-ink font-semibold">
                Some details still need your check
              </p>
              <p className="text-body-sm text-ink-muted max-w-prose">
                Parts of this report are based on text that was hard to read.
                Confirm the flagged details before you rely on them.
              </p>
              {isPartial ? (
                <p className="text-body-sm text-ink-muted max-w-prose">
                  These pages could not be read:{" "}
                  {analysis.analysisMetadata.unavailablePages.join(", ")}.
                </p>
              ) : null}
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Section title="Overview">
        <p className="text-body text-ink max-w-prose leading-relaxed">
          {analysis.overview}
        </p>
        <p className="text-body-sm text-ink-muted max-w-prose leading-relaxed">
          {analysis.explanation}
        </p>
      </Section>

      {keyInformation.length > 0 ? (
        <Section title="Key information">
          <FindingList findings={keyInformation} evidence={evidence} />
        </Section>
      ) : null}

      {analysis.obligations.length > 0 ? (
        <Section title="Obligations">
          <FindingList findings={analysis.obligations} evidence={evidence} />
        </Section>
      ) : null}

      {analysis.watchouts.length > 0 ? (
        <Section title="Watch-outs">
          <FindingList findings={analysis.watchouts} evidence={evidence} />
        </Section>
      ) : null}

      {analysis.importantDates.length > 0 ? (
        <Section title="Important dates">
          <div className="grid gap-4">
            {analysis.importantDates.map((date) => (
              <div key={date.id}>
                <FindingItem finding={date} evidence={evidence} />
                <p className="text-caption text-ink-subtle mt-1">
                  {date.dateText}
                  {date.date ? ` (${date.date})` : ""}
                </p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {analysis.consequences.length > 0 ? (
        <Section title="Consequences">
          <FindingList findings={analysis.consequences} evidence={evidence} />
        </Section>
      ) : null}

      {analysis.nextSteps.length > 0 ? (
        <Section title="Next steps">
          <FindingList findings={analysis.nextSteps} evidence={evidence} />
        </Section>
      ) : null}

      {analysis.specializedSections.map((specialized) => (
        <Section key={specialized.id} title={specialized.title}>
          <FindingList findings={specialized.items} evidence={evidence} />
        </Section>
      ))}

      {analysis.reviewRequirements.length > 0 ? (
        <Section title="Needs your attention">
          <div className="grid gap-3">
            {analysis.reviewRequirements.map((item) => {
              const isResolvedItem =
                resolved && item.id === requiredReview?.id;
              return (
                <Card
                  key={item.id}
                  className={cn(
                    "border-l-4",
                    isResolvedItem
                      ? "border-tone-positive-border"
                      : "border-tone-caution-border",
                  )}
                >
                  <CardContent className="grid gap-2.5 pt-4 sm:pt-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-body text-ink font-semibold">
                        {item.field}
                      </h3>
                      <PresentationValue
                        category="status"
                        value={isResolvedItem ? "FOUND" : "REVIEW_REQUIRED"}
                      />
                    </div>
                    <p className="text-body-sm text-ink-muted max-w-prose">
                      {item.reason}
                    </p>
                    {isResolvedItem ? (
                      <FormMessage variant="success">
                        Correction saved.
                      </FormMessage>
                    ) : item.reviewStatus === "REQUIRED" ? (
                      panelOpen ? (
                        <CorrectionPanel
                          field={item.field}
                          reason={item.reason}
                          evidence={analysis.evidence.find(
                            (e) => e.id === item.evidenceId,
                          )}
                          defaultValue=""
                          onSave={handleSave}
                          onCancel={() => setPanelOpen(false)}
                        />
                      ) : (
                        <button
                          type="button"
                          className="text-body-sm text-accent-ink hover:text-accent ease-standard justify-self-start rounded-sm font-medium underline underline-offset-2 transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus"
                          onClick={() => setPanelOpen(true)}
                        >
                          Correct this value
                        </button>
                      )
                    ) : null}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </Section>
      ) : null}

      {analysis.limitations.length > 0 ? (
        <Section title="What this report doesn't cover">
          <ul className="text-body-sm text-ink-muted grid max-w-prose list-disc gap-1.5 pl-5 leading-relaxed marker:text-ink-subtle">
            {analysis.limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        </Section>
      ) : null}

      <footer className="text-caption text-ink-subtle border-hairline mt-2 border-t pt-4 tabular-nums">
        Generated {formatGenerated(analysis.analysisMetadata.generatedAt)} ·{" "}
        {analysis.analysisMetadata.language} · report v
        {analysis.analysisMetadata.analysisVersion}
      </footer>
    </article>
  );
}
