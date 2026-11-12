import type {
  AnalysisResult,
  EvidenceReference,
  Finding,
} from "@/contracts";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import type {
  AnalysisEngine,
  AnalysisEngineInput,
  AnalysisEngineResult,
} from "@/features/intelligence/services/analysis-engine";
import {
  HybridAnalysisEngine,
  type FindingQuote,
} from "@/features/intelligence/services/hybrid-engine";
import {
  mapQuoteToEvidence,
  type EvidencePage,
} from "@/features/intelligence/services/evidence-mapping";
import { applySafetyRules } from "@/features/intelligence/services/safety-rules";
import {
  decideOutcome,
  deriveReviewRequirements,
} from "@/features/intelligence/services/review-requirements";

/** The finding lists whose entries are plain findings we can attach evidence to. */
const FINDING_LISTS = [
  "keyInformation",
  "obligations",
  "watchouts",
  "consequences",
  "nextSteps",
  "importantDates",
] as const;

/**
 * Map every finding's quotes to OCR evidence. Returns the evidence references
 * and mutates each finding's `evidenceIds`. A quote that maps to nothing is
 * dropped — no fabricated evidence.
 */
function mapEvidence(
  result: AnalysisResult,
  documentId: string,
  pages: EvidencePage[],
  quotesByFinding: Map<string, FindingQuote[]>,
): EvidenceReference[] {
  const evidence: EvidenceReference[] = [];
  let seq = 0;

  for (const list of FINDING_LISTS) {
    for (const finding of result[list] as Finding[]) {
      const quotes = quotesByFinding.get(finding.id) ?? [];
      const evidenceIds: string[] = [];
      for (const { quote, page } of quotes) {
        // Search the quote's real page (the mapper also checks adjacent pages
        // and falls back to fuzzy matching across them).
        const match = mapQuoteToEvidence(quote, page, pages);
        if (!match) continue;
        const id = `ev-${++seq}`;
        evidence.push({
          id,
          documentId,
          pageNumber: match.pageNumber,
          excerpt: match.excerpt,
          // USER_CORRECTION when the matched span covers user-corrected words.
          sourceType: match.sourceType,
          wordStart: match.wordStart,
          wordEnd: match.wordEnd,
          matchConfidence: match.matchConfidence,
        });
        evidenceIds.push(id);
      }
      finding.evidenceIds = evidenceIds;
    }
  }
  return evidence;
}

/**
 * The production analysis engine. It runs the hybrid draft, maps AI quotes to
 * OCR evidence, applies the deterministic safety rules, derives review
 * requirements, and decides the outcome. The ANALYZE job handler then validates
 * (parseAnalysisResult) and persists the returned result.
 */
export class RealAnalysisEngine implements AnalysisEngine {
  private readonly hybrid: HybridAnalysisEngine;

  constructor(chat: ChatProvider) {
    this.hybrid = new HybridAnalysisEngine(chat);
  }

  async analyze(input: AnalysisEngineInput): Promise<AnalysisEngineResult> {
    const { result: draft, quotesByFinding } =
      await this.hybrid.analyzeWithQuotes(input);

    // NormalizedPage is a structural supertype of EvidencePage.
    const pages: EvidencePage[] = input.pages;

    // Evidence mapping mutates the draft findings' evidenceIds in place.
    draft.evidence = mapEvidence(draft, input.documentId, pages, quotesByFinding);

    const { result: safe } = applySafetyRules(draft);

    safe.reviewRequirements = deriveReviewRequirements(safe, pages);
    const outcome = decideOutcome(safe);

    return { result: safe, outcome };
  }
}
