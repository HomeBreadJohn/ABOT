import "server-only";

import type { z } from "zod";

import {
  parseAnalysisResult,
  suggestRelationshipsResponseSchema,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Deterministic cross-document matching. NO AI: suggestions come from comparing
 * extracted identifiers (issuer, account/reference numbers, dates within 60
 * days) and amounts. Amounts are weak evidence, so an amount-only match is
 * capped at confidence 0.3. Suggestions are always POSSIBLE_MATCH; only a user
 * approval (reviewRelationship) can promote one to CONFIRMED_MATCH.
 */

const DATE_WINDOW_MS = 60 * 24 * 60 * 60_000;

/**
 * The identifiers extracted from a document's latest analysis, plus the
 * evidence IDs that support each value. evidenceByValue maps a normalized
 * identifier/amount/date string to the evidence IDs citing it.
 */
export type DocumentIntelligence = {
  issuer: string | null;
  accountNumbers: string[];
  referenceNumbers: string[];
  amounts: string[];
  dates: string[]; // ISO 8601
  evidenceByValue: Record<string, string[]>;
};

/** Data-access seam so unit tests run against in-memory fakes. */
export type SuggestRelationshipsDeps = {
  /** True when the user owns or is shared the document; false otherwise. */
  authorize: (userId: string, documentId: string) => Promise<boolean>;
  loadIntelligence: (documentId: string) => Promise<DocumentIntelligence>;
  /** True when a REJECTED relationship for this unordered pair already exists. */
  rejectedPairExists: (
    userId: string,
    documentIdA: string,
    documentIdB: string,
  ) => Promise<boolean>;
  /** Insert a PENDING POSSIBLE_MATCH row; returns its id. */
  persist: (input: {
    userId: string;
    source: string;
    target: string;
    confidence: number;
  }) => Promise<string>;
};

type SignalKind = "ISSUER" | "ACCOUNT" | "DATE" | "AMOUNT";
type Signal = {
  kind: SignalKind;
  value: string;
  weight: number;
  evidenceIds: string[];
};

export async function suggestRelationships(
  userId: string,
  documentIdA: string,
  documentIdB: string,
  deps: SuggestRelationshipsDeps = defaultDeps(),
): Promise<z.infer<typeof suggestRelationshipsResponseSchema>> {
  // Both documents must be owned by or shared with the user; otherwise we hide
  // their existence with NOT_FOUND (never FORBIDDEN).
  const [okA, okB] = await Promise.all([
    deps.authorize(userId, documentIdA),
    deps.authorize(userId, documentIdB),
  ]);
  if (!okA || !okB) throw new AppError("NOT_FOUND");

  // A pair the user already rejected is never suggested again.
  if (await deps.rejectedPairExists(userId, documentIdA, documentIdB)) {
    return suggestRelationshipsResponseSchema.parse({ suggestions: [] });
  }

  const [intelA, intelB] = await Promise.all([
    deps.loadIntelligence(documentIdA),
    deps.loadIntelligence(documentIdB),
  ]);

  const signals = matchSignals(intelA, intelB);
  if (signals.length === 0) {
    return suggestRelationshipsResponseSchema.parse({ suggestions: [] });
  }

  const confidence = scoreConfidence(signals);
  const evidenceIds = [...new Set(signals.flatMap((s) => s.evidenceIds))];

  const id = await deps.persist({
    userId,
    source: documentIdA,
    target: documentIdB,
    confidence,
  });

  return suggestRelationshipsResponseSchema.parse({
    suggestions: [
      {
        id,
        documentIdA,
        documentIdB,
        type: "POSSIBLE_MATCH",
        confidence,
        matchingEvidenceIds: evidenceIds,
      },
    ],
  });
}

/** Normalize an identifier for comparison: upper-case, strip non-alphanumerics. */
function normId(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/**
 * Collect the matching identifier signals between two documents. Each signal
 * carries the evidence IDs from BOTH documents that cite the matched value.
 * Weights: issuer and account/reference numbers are strong; a date within 60
 * days is moderate; a shared amount is weak.
 */
function matchSignals(a: DocumentIntelligence, b: DocumentIntelligence): Signal[] {
  const signals: Signal[] = [];

  if (a.issuer && b.issuer && normId(a.issuer) === normId(b.issuer)) {
    signals.push({
      kind: "ISSUER",
      value: a.issuer,
      weight: 0.5,
      evidenceIds: [...evidenceFor(a, a.issuer), ...evidenceFor(b, b.issuer)],
    });
  }

  for (const value of sharedByNorm(
    [...a.accountNumbers, ...a.referenceNumbers],
    [...b.accountNumbers, ...b.referenceNumbers],
  )) {
    signals.push({
      kind: "ACCOUNT",
      value,
      weight: 0.5,
      evidenceIds: [...evidenceFor(a, value), ...evidenceFor(b, value)],
    });
  }

  for (const [av, bv] of datesWithinWindow(a.dates, b.dates)) {
    signals.push({
      kind: "DATE",
      value: av,
      weight: 0.3,
      evidenceIds: [...evidenceFor(a, av), ...evidenceFor(b, bv)],
    });
  }

  for (const value of sharedByNorm(a.amounts, b.amounts)) {
    signals.push({
      kind: "AMOUNT",
      value,
      weight: 0.2, // weak: an amount-only match is capped at 0.3 below
      evidenceIds: [...evidenceFor(a, value), ...evidenceFor(b, value)],
    });
  }

  return signals;
}

/** Evidence IDs in a document that support the given value (empty when none). */
function evidenceFor(doc: DocumentIntelligence, value: string): string[] {
  return doc.evidenceByValue[value] ?? [];
}

/** Values present in both lists, compared by normalized form; originals from A. */
function sharedByNorm(listA: string[], listB: string[]): string[] {
  const normsB = new Set(listB.map(normId));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of listA) {
    const n = normId(value);
    if (n && normsB.has(n) && !seen.has(n)) {
      seen.add(n);
      out.push(value);
    }
  }
  return out;
}

/** Pairs of ISO dates (one from each list) that fall within 60 days. */
function datesWithinWindow(datesA: string[], datesB: string[]): [string, string][] {
  const out: [string, string][] = [];
  for (const a of datesA) {
    const ta = Date.parse(a);
    if (Number.isNaN(ta)) continue;
    for (const b of datesB) {
      const tb = Date.parse(b);
      if (Number.isNaN(tb)) continue;
      if (Math.abs(ta - tb) <= DATE_WINDOW_MS) out.push([a, b]);
    }
  }
  return out;
}

/**
 * Combine signal weights into a 0-1 confidence. A match whose ONLY signals are
 * shared amounts is capped at 0.3, because a matching amount alone is weak.
 */
function scoreConfidence(signals: Signal[]): number {
  const score = Math.min(1, signals.reduce((sum, s) => sum + s.weight, 0));
  const onlyAmounts = signals.every((s) => s.kind === "AMOUNT");
  return onlyAmounts ? Math.min(0.3, score) : score;
}

/* -------------------------------------------------------------------------- */
/* Production data access. Services use the service-role admin client, so the  */
/* app-level owner-or-shared check above is the real authorization gate.       */
/* -------------------------------------------------------------------------- */

const ACCOUNT_RE = /\b(?:acct|account|acc)[\s.:#-]*([A-Z0-9][A-Z0-9-]{3,})/gi;
const REFERENCE_RE = /\b(?:ref|reference|rrn)[\s.:#-]*([A-Z0-9][A-Z0-9-]{3,})/gi;
const AMOUNT_RE = /(?:php|\$|₱)?\s*([0-9][0-9,]*\.[0-9]{2})/gi;

function defaultDeps(): SuggestRelationshipsDeps {
  const admin = createAdminClient();
  return {
    async authorize(userId, documentId) {
      const { data: doc } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", documentId)
        .maybeSingle();
      if (!doc) return false;
      if (doc.user_id === userId) return true;
      const { data: share } = await admin
        .from("document_shares")
        .select("id")
        .eq("document_id", documentId)
        .eq("shared_with_user_id", userId)
        .maybeSingle();
      return Boolean(share);
    },
    async loadIntelligence(documentId) {
      // Latest analysis for this document.
      const { data: analysis } = await admin
        .from("document_analyses")
        .select("id, report_json")
        .eq("document_id", documentId)
        .eq("status", "SUCCEEDED")
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!analysis) return emptyIntel();

      const result = parseAnalysisResult(analysis.report_json, { documentId });
      return extractIntelligence(result);
    },
    async rejectedPairExists(userId, documentIdA, documentIdB) {
      const { data } = await admin
        .from("document_relationships")
        .select("id, source_document_id, target_document_id")
        .eq("user_id", userId)
        .eq("approval_status", "REJECTED")
        .or(
          `and(source_document_id.eq.${documentIdA},target_document_id.eq.${documentIdB}),and(source_document_id.eq.${documentIdB},target_document_id.eq.${documentIdA})`,
        )
        .limit(1)
        .maybeSingle();
      return Boolean(data);
    },
    async persist({ userId, source, target, confidence }) {
      const { data, error } = await admin
        .from("document_relationships")
        .insert({
          user_id: userId,
          source_document_id: source,
          target_document_id: target,
          relationship_type: "POSSIBLE_MATCH",
          confidence,
          approval_status: "PENDING",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
  };
}

function emptyIntel(): DocumentIntelligence {
  return {
    issuer: null,
    accountNumbers: [],
    referenceNumbers: [],
    amounts: [],
    dates: [],
    evidenceByValue: {},
  };
}

/**
 * Pull deterministic identifiers from a parsed analysis. Issuer and dates come
 * from the structured report; account/reference numbers and amounts are scanned
 * from the evidence excerpts (the OCR text), and each value is linked back to
 * the evidence IDs it appears in.
 */
function extractIntelligence(
  result: ReturnType<typeof parseAnalysisResult>,
): DocumentIntelligence {
  const intel = emptyIntel();
  intel.issuer = result.document.issuer;

  if (intel.issuer) addEvidence(intel, intel.issuer, []);

  for (const d of result.importantDates) {
    if (d.date) {
      intel.dates.push(d.date);
      for (const id of d.evidenceIds) addEvidence(intel, d.date, [id]);
    }
  }

  for (const ev of result.evidence) {
    scanInto(intel, intel.accountNumbers, ACCOUNT_RE, ev.excerpt, ev.id);
    scanInto(intel, intel.referenceNumbers, REFERENCE_RE, ev.excerpt, ev.id);
    scanInto(intel, intel.amounts, AMOUNT_RE, ev.excerpt, ev.id);
    // Issuer evidence: the excerpt mentioning the issuer supports it.
    if (intel.issuer && ev.excerpt.toUpperCase().includes(intel.issuer.toUpperCase())) {
      addEvidence(intel, intel.issuer, [ev.id]);
    }
  }

  return intel;
}

function scanInto(
  intel: DocumentIntelligence,
  bucket: string[],
  re: RegExp,
  text: string,
  evidenceId: string,
): void {
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const value = m[1];
    if (!bucket.includes(value)) bucket.push(value);
    addEvidence(intel, value, [evidenceId]);
  }
}

function addEvidence(
  intel: DocumentIntelligence,
  value: string,
  evidenceIds: string[],
): void {
  const existing = intel.evidenceByValue[value] ?? [];
  for (const id of evidenceIds) if (!existing.includes(id)) existing.push(id);
  intel.evidenceByValue[value] = existing;
}
