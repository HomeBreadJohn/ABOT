/**
 * Turns a draft AnalysisResult into review requirements and an outcome.
 *
 * Rules (plan Task B16):
 * - A critical field (money amount, deadline, penalty, or contractual
 *   condition) whose mapped evidence words average BELOW 0.85 OCR confidence is
 *   REQUIRED with impact CRITICAL. Confidence that was never measured (no words,
 *   or every word confidence null) is a REASON TO FLAG, not high confidence.
 * - Any other finding with confidence below 0.6 is OPTIONAL.
 * - An ambiguous classification adds one OPTIONAL requirement for `category`.
 *
 * Outcome: any unresolved REQUIRED => NEEDS_CORRECTION; only OPTIONAL =>
 * REVIEW_REQUIRED; none => COMPLETED.
 */
import type {
  AnalysisResult,
  EvidenceReference,
  Finding,
} from "@/contracts";
import type { EvidencePage } from "@/features/intelligence/services/evidence-mapping";

/** The contract has no exported type alias; derive it from AnalysisResult. */
type ReviewRequirement = AnalysisResult["reviewRequirements"][number];

const CRITICAL_CONFIDENCE = 0.85;
const OPTIONAL_CONFIDENCE = 0.6;
const AMBIGUOUS_CLASSIFICATION = 0.7;

/** Keywords that mark a finding as a money/deadline/penalty/condition field. */
const CRITICAL_FIELD_WORDS = [
  "amount",
  "due",
  "total",
  "balance",
  "payable",
  "payment",
  "fee",
  "charge",
  "penalty",
  "surcharge",
  "deadline",
  "date",
  "expir",
  "condition",
  "term",
  "obligation",
  "interest",
];

type FindingWithList = { finding: Finding; list: string; pageNumber: number };

/** Every finding across the lists, with the page its first evidence sits on. */
function allFindings(result: AnalysisResult): FindingWithList[] {
  const evidenceById = new Map(result.evidence.map((e) => [e.id, e]));
  const lists: [string, Finding[]][] = [
    ["keyInformation", result.keyInformation],
    ["obligations", result.obligations],
    ["watchouts", result.watchouts],
    ["consequences", result.consequences],
    ["nextSteps", result.nextSteps],
    ["importantDates", result.importantDates],
  ];
  const out: FindingWithList[] = [];
  for (const [list, findings] of lists) {
    for (const finding of findings) {
      const firstEvidence = finding.evidenceIds
        .map((id) => evidenceById.get(id))
        .find((e): e is EvidenceReference => e !== undefined);
      out.push({ finding, list, pageNumber: firstEvidence?.pageNumber ?? 1 });
    }
  }
  return out;
}

/** True when the finding concerns a money amount, deadline, penalty, or condition. */
function isCriticalField(item: FindingWithList): boolean {
  if (item.list === "importantDates" || item.list === "consequences") return true;
  const text = `${item.finding.title} ${item.finding.explanation}`.toLowerCase();
  return CRITICAL_FIELD_WORDS.some((w) => text.includes(w));
}

/**
 * Average OCR confidence of the words a finding's evidence covers. Returns null
 * when nothing was measured (no evidence, no words in range, or every word
 * confidence null) — which the caller treats as a reason to flag, not as high
 * confidence.
 */
function evidenceConfidence(
  finding: Finding,
  result: AnalysisResult,
  pages: EvidencePage[],
): { average: number | null; evidenceId?: string } {
  const evidenceById = new Map(result.evidence.map((e) => [e.id, e]));
  const pageByNumber = new Map(pages.map((p) => [p.pageNumber, p]));
  const confidences: number[] = [];
  let firstEvidenceId: string | undefined;

  for (const id of finding.evidenceIds) {
    const evidence = evidenceById.get(id);
    if (!evidence) continue;
    firstEvidenceId ??= evidence.id;
    const page = pageByNumber.get(evidence.pageNumber);
    if (!page || evidence.wordStart === undefined || evidence.wordEnd === undefined) {
      continue;
    }
    for (const word of page.words) {
      if (
        word.index >= evidence.wordStart &&
        word.index <= evidence.wordEnd &&
        word.confidence !== null
      ) {
        confidences.push(word.confidence);
      }
    }
  }

  const average =
    confidences.length === 0
      ? null
      : confidences.reduce((sum, c) => sum + c, 0) / confidences.length;
  return { average, evidenceId: firstEvidenceId };
}

/** Derive the review requirements for a draft analysis. */
export function deriveReviewRequirements(
  result: AnalysisResult,
  pages: EvidencePage[],
): ReviewRequirement[] {
  const requirements: ReviewRequirement[] = [];
  let seq = 0;
  const nextId = () => `rr-${++seq}`;

  for (const item of allFindings(result)) {
    const { finding } = item;

    if (isCriticalField(item)) {
      const { average, evidenceId } = evidenceConfidence(finding, result, pages);
      // Below 0.85, or never measured: a critical field must be confirmed.
      if (average === null || average < CRITICAL_CONFIDENCE) {
        requirements.push({
          id: nextId(),
          field: finding.title,
          reason:
            average === null
              ? "OCR confidence was not measured on a critical field."
              : "OCR confidence on a critical field is below 0.85.",
          impact: "An unverified value could lead to a wrong amount, date, or obligation.",
          impactLevel: "CRITICAL",
          pageNumber: item.pageNumber,
          reviewStatus: "REQUIRED",
          findingId: finding.id,
          ...(evidenceId ? { evidenceId } : {}),
        });
        continue;
      }
    }

    // Any other finding the model is not confident about is optional to review.
    if (finding.confidence < OPTIONAL_CONFIDENCE) {
      requirements.push({
        id: nextId(),
        field: finding.title,
        reason: "The finding has low confidence; confirm it against the document.",
        impact: "This detail may be imprecise.",
        impactLevel: "LOW",
        pageNumber: item.pageNumber,
        reviewStatus: "OPTIONAL",
        findingId: finding.id,
      });
    }
  }

  if (result.document.classificationConfidence < AMBIGUOUS_CLASSIFICATION) {
    requirements.push({
      id: nextId(),
      field: "category",
      reason: "The document category is ambiguous; confirm it is correct.",
      impact: "A wrong category can change which checks run.",
      impactLevel: "LOW",
      pageNumber: 1,
      reviewStatus: "OPTIONAL",
    });
  }

  return requirements;
}

/** Decide the pipeline outcome from a result's review requirements. */
export function decideOutcome(
  result: AnalysisResult,
): "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION" {
  const open = result.reviewRequirements.filter(
    (r) => r.reviewStatus !== "RESOLVED",
  );
  if (open.some((r) => r.reviewStatus === "REQUIRED")) return "NEEDS_CORRECTION";
  if (open.length > 0) return "REVIEW_REQUIRED";
  return "COMPLETED";
}
