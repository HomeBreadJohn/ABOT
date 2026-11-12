import type { EvidenceReference, Finding } from "@/contracts";
import { PresentationValue } from "@/components/ui/presentation-value";
import { bucketConfidence } from "@/features/documents/report/bucket-confidence";
import { cn } from "@/lib/utils";

/** Statuses whose uncertainty earns a second, non-color signal (left border). */
const UNCERTAIN_BORDER: Partial<Record<Finding["informationStatus"], string>> = {
  INFERRED: "border-l-2 border-tone-caution-border pl-3",
  UNCLEAR: "border-l-2 border-tone-caution-border pl-3",
  CONFLICTING: "border-l-2 border-tone-caution-border pl-3",
};

function EvidenceDisclosure({
  evidence,
}: {
  evidence: readonly EvidenceReference[];
}) {
  return (
    <details className="text-body-sm mt-3">
      <summary className="text-ink-muted cursor-pointer font-medium">
        Show evidence ({evidence.length})
      </summary>
      <ul className="mt-2 grid gap-3">
        {evidence.map((item) => (
          <li
            key={item.id}
            className="border-hairline bg-surface-sunken rounded-md border p-3"
          >
            <blockquote className="text-ink border-strong border-l-2 pl-3 italic">
              {item.excerpt}
            </blockquote>
            <p className="text-caption text-ink-subtle mt-2">
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
                className="mt-2"
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

  return (
    <article className={cn("py-2", UNCERTAIN_BORDER[finding.informationStatus])}>
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-body text-ink font-semibold">{finding.title}</h3>
        <PresentationValue
          category="status"
          value={finding.informationStatus}
        />
        {finding.severity ? (
          <PresentationValue category="severity" value={finding.severity} />
        ) : null}
      </div>
      <p className="text-body-sm text-ink mt-2">{finding.explanation}</p>
      <p className="text-body-sm text-ink-muted mt-1">Why: {finding.basis}</p>
      <p className="text-caption text-ink-subtle mt-1">
        Confidence: {bucketConfidence(finding.confidence)}
      </p>
      {cited.length > 0 ? <EvidenceDisclosure evidence={cited} /> : null}
    </article>
  );
}
