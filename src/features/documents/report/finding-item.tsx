import type { EvidenceReference, Finding } from "@/contracts";
import { PresentationValue } from "@/components/ui/presentation-value";
import { bucketConfidence } from "@/features/documents/report/bucket-confidence";
import { presentValue, type PresentationTone } from "@/lib/presentation";
import { cn } from "@/lib/utils";

/**
 * The left-edge accent reuses the presentation tone, so the border, pill and
 * cue always agree. FOUND reads certain (positive); everything less certain
 * carries a visible caution/critical edge, never color alone.
 */
const TONE_EDGE: Record<PresentationTone, string> = {
  positive: "border-tone-positive-border",
  informative: "border-tone-informative-border",
  caution: "border-tone-caution-border",
  critical: "border-tone-critical-border",
  neutral: "border-hairline",
};

function EvidenceDisclosure({
  evidence,
}: {
  evidence: readonly EvidenceReference[];
}) {
  return (
    <details className="text-body-sm group mt-3">
      <summary className="text-accent-ink ease-standard hover:text-accent inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-focus [&::-webkit-details-marker]:hidden">
        <span
          aria-hidden="true"
          className="ease-standard inline-block transition-transform duration-150 group-open:rotate-90"
        >
          ›
        </span>
        Show evidence ({evidence.length})
      </summary>
      <ul className="mt-3 grid gap-3">
        {evidence.map((item) => (
          <li
            key={item.id}
            className="border-hairline bg-surface-sunken rounded-md border p-3.5"
          >
            <blockquote className="text-ink border-strong border-l-2 pl-3 leading-relaxed italic">
              {item.excerpt}
            </blockquote>
            <p className="text-caption text-ink-subtle mt-2.5 tabular-nums">
              Page {item.pageNumber}
              {item.wordStart !== undefined && item.wordEnd !== undefined
                ? ` · words ${item.wordStart}\u2013${item.wordEnd}`
                : ""}
              {item.matchConfidence !== undefined
                ? ` · match ${bucketConfidence(item.matchConfidence)}`
                : ""}
            </p>
            {item.sourceType === "USER_CORRECTION" ? (
              <PresentationValue
                className="mt-2.5"
                presentation={{
                  label: "Your correction",
                  cue: "\u270E",
                  tone: "informative",
                  supported: true,
                }}
              />
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

export function FindingItem({
  finding,
  evidence,
}: {
  finding: Finding;
  evidence: readonly EvidenceReference[];
}) {
  const cited = finding.evidenceIds
    .map((id) => evidence.find((item) => item.id === id))
    .filter((item): item is EvidenceReference => item !== undefined);

  const tone = presentValue("status", finding.informationStatus).tone;
  const isCertain = tone === "positive";

  return (
    <article
      className={cn(
        "border-l-2 py-1.5 pl-4",
        // A certain finding sits quietly; anything less certain earns a
        // visible tonal edge to lead the eye to what needs checking.
        isCertain ? "border-tone-positive-border/60" : TONE_EDGE[tone],
      )}
    >
      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <h3 className="text-body text-ink font-semibold">{finding.title}</h3>
        <PresentationValue
          category="status"
          value={finding.informationStatus}
        />
        {finding.severity ? (
          <PresentationValue category="severity" value={finding.severity} />
        ) : null}
      </div>
      <p className="text-body-sm text-ink mt-2 max-w-prose leading-relaxed">
        {finding.explanation}
      </p>
      <p className="text-body-sm text-ink-muted mt-1.5 max-w-prose">
        <span className="text-ink-subtle font-medium">Why</span> {finding.basis}
      </p>
      <p className="text-caption text-ink-subtle mt-1.5 tabular-nums">
        Confidence: {bucketConfidence(finding.confidence)}
      </p>
      {cited.length > 0 ? <EvidenceDisclosure evidence={cited} /> : null}
    </article>
  );
}
