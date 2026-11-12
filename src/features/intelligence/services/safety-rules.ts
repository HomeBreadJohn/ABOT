import type { AnalysisResult, Finding } from "@/contracts";

/**
 * Deterministic user-safety rules from product.md section 8. These run after
 * evidence mapping and before validation (plan Task B16). Each rule that
 * changes meaning records an adjustment and, where appropriate, adds a
 * limitation. The input is never mutated; a new result is returned.
 */
export type Adjustment = { rule: string; target: string; note: string };

/** Lists on AnalysisResult whose entries are plain findings we can rewrite. */
const FINDING_LISTS = [
  "keyInformation",
  "obligations",
  "watchouts",
  "nextSteps",
  "importantDates",
] as const;

const FRAUD_WORDS = ["fraud", "scam", "peke", "panloloko"];
const COMPLETED_ACTION_PHRASES = [
  "i have paid",
  "submitted for you",
  "nabayaran na",
];

function hasAny(text: string, needles: string[]): boolean {
  const lower = text.toLowerCase();
  return needles.some((n) => lower.includes(n));
}

/** Replace fraud/scam wording with neutral "unusual; verify" wording. */
function neutralize(text: string): string {
  let out = text;
  for (const word of FRAUD_WORDS) {
    out = out.replace(new RegExp(word, "gi"), "unusual");
  }
  return `${out} This is unusual; verify with the issuer.`;
}

/**
 * A payment-match claim: the finding asserts a payment settled/paid a bill
 * and its own reasoning rests only on the amounts matching.
 */
function isPaymentMatchClaim(f: Finding): boolean {
  const text = `${f.title} ${f.explanation}`.toLowerCase();
  const claimsSettled =
    /\b(settl|paid|pay(?:ment)?)\b/.test(text) && /\bbill\b/.test(text);
  const onlyAmountMatch = text.includes("amount") && text.includes("match");
  return claimsSettled && onlyAmountMatch;
}

export function applySafetyRules(draft: AnalysisResult): {
  result: AnalysisResult;
  adjustments: Adjustment[];
} {
  const result = structuredClone(draft);
  const adjustments: Adjustment[] = [];
  const addLimitation = (text: string) => {
    if (!result.limitations.includes(text)) result.limitations.push(text);
  };

  // Does any finding across every list cite a CRITICAL evidenced concern?
  const hasCriticalEvidencedFinding = [
    ...result.keyInformation,
    ...result.obligations,
    ...result.watchouts,
    ...result.nextSteps,
    ...result.importantDates,
  ].some((f) => f.severity === "CRITICAL" && f.evidenceIds.length > 0);

  for (const list of FINDING_LISTS) {
    // Snapshot: rule 7 appends to result.nextSteps, which is itself a list here.
    const findings = [...(result[list] as Finding[])];
    const kept: Finding[] = [];

    for (const finding of findings) {
      // Rule 6: a finding claiming Kalinga completed an action is removed.
      if (hasAny(`${finding.title} ${finding.explanation}`, COMPLETED_ACTION_PHRASES)) {
        adjustments.push({
          rule: "claims-completed-action",
          target: finding.id,
          note: "Removed a finding that claimed Kalinga took an action on the user's behalf.",
        });
        continue;
      }

      // Rule 7: payment-settled-by-matching-amounts becomes INFERRED + verify step.
      if (isPaymentMatchClaim(finding)) {
        finding.informationStatus = "INFERRED";
        adjustments.push({
          rule: "payment-match-inference",
          target: finding.id,
          note: "A matching amount does not prove a bill was paid; marked as inferred.",
        });
        result.nextSteps.push({
          id: `verify-${finding.id}`,
          title: "Verify the payment with the issuer",
          explanation:
            "Confirm with the issuer or a receipt that this payment settled the bill; a matching amount alone does not prove it.",
          informationStatus: "INFERRED",
          confidence: 0.3,
          basis: "Safety rule: payment cannot be confirmed from matching amounts alone.",
          evidenceIds: [],
        });
      }

      // Rule 1: a FOUND finding with no mapped evidence is not supported.
      if (finding.informationStatus === "FOUND" && finding.evidenceIds.length === 0) {
        finding.informationStatus = "UNCLEAR";
        adjustments.push({
          rule: "unsupported-found",
          target: finding.id,
          note: "No evidence mapped; downgraded FOUND to UNCLEAR.",
        });
        addLimitation("Some findings could not be matched to the document text; confirm them against the original.");
      }

      // Rule 3: a CRITICAL/HIGH watchout without evidence is capped at MEDIUM.
      if (
        list === "watchouts" &&
        (finding.severity === "CRITICAL" || finding.severity === "HIGH") &&
        finding.evidenceIds.length === 0
      ) {
        finding.severity = "MEDIUM";
        adjustments.push({
          rule: "unsupported-high-watchout",
          target: finding.id,
          note: "No evidence; capped severity at MEDIUM.",
        });
      }

      // Rule 4: an INFERRED finding's severity is capped at MEDIUM.
      if (
        finding.informationStatus === "INFERRED" &&
        (finding.severity === "CRITICAL" || finding.severity === "HIGH")
      ) {
        finding.severity = "MEDIUM";
        adjustments.push({
          rule: "inferred-severity-cap",
          target: finding.id,
          note: "Inferred findings cannot exceed MEDIUM severity.",
        });
      }

      // Rule 5: fraud/scam wording without a CRITICAL evidenced finding is neutralized.
      if (
        hasAny(`${finding.title} ${finding.explanation}`, FRAUD_WORDS) &&
        !hasCriticalEvidencedFinding
      ) {
        finding.title = neutralize(finding.title);
        finding.explanation = neutralize(finding.explanation);
        adjustments.push({
          rule: "unsupported-fraud-claim",
          target: finding.id,
          note: "Replaced fraud/scam wording with neutral 'unusual; verify with the issuer' wording.",
        });
        addLimitation("A fraud concern was stated without CRITICAL evidence; verify any unusual details with the issuer.");
      }

      kept.push(finding);
    }

    (result[list] as Finding[]).length = 0;
    (result[list] as Finding[]).push(...kept);
  }

  // Rule 2: an EXPLICIT consequence without evidence becomes INFERRED. Done
  // separately because consequences carry a `kind` field findings do not.
  for (const consequence of result.consequences) {
    if (consequence.kind === "EXPLICIT" && consequence.evidenceIds.length === 0) {
      consequence.kind = "INFERRED";
      consequence.informationStatus = "INFERRED";
      adjustments.push({
        rule: "explicit-consequence-without-evidence",
        target: consequence.id,
        note: "An explicit consequence needs evidence; marked as inferred.",
      });
      addLimitation("A stated consequence could not be evidenced and is presented as an inference.");
    }
  }

  return { result, adjustments };
}
