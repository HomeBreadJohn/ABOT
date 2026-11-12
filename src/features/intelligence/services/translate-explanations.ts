import "server-only";

import { z } from "zod";

import {
  parseAnalysisResult,
  type AnalysisResult,
  type ExplanationLanguage,
  type Finding,
} from "@/contracts";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import { requestJson } from "@/features/intelligence/services/json-reply";
import {
  buildTranslatePrompt,
  TRANSLATE_BATCH_CHAR_LIMIT,
} from "@/features/intelligence/prompts/translate";
import type {
  JobHandler,
  JobOutcome,
} from "@/features/processing/services/job-registry";
import { registerJobHandler } from "@/features/processing/services/job-registry";
import { createAdminClient } from "@/lib/supabase/admin";
import { getChatProvider } from "@/lib/providers";
import { logger } from "@/lib/logging/logger";

/** The lists whose findings carry a translatable title + explanation. */
const FINDING_LISTS = [
  "keyInformation",
  "obligations",
  "watchouts",
  "consequences",
  "nextSteps",
  "importantDates",
] as const;

/**
 * A reference to a translatable string inside the analysis: `get` reads it and
 * `set` writes the translation back. Only these targets are ever mutated, so
 * every other field stays byte-for-byte identical to the source.
 */
type FieldRef = { get: () => string; set: (value: string) => void };

/** Collect references to every user-facing text field, in a stable order. */
function collectFieldRefs(result: AnalysisResult): FieldRef[] {
  const refs: FieldRef[] = [
    { get: () => result.overview, set: (v) => (result.overview = v) },
    { get: () => result.explanation, set: (v) => (result.explanation = v) },
  ];
  const pushFinding = (f: Finding) => {
    refs.push({ get: () => f.title, set: (v) => (f.title = v) });
    refs.push({ get: () => f.explanation, set: (v) => (f.explanation = v) });
  };
  for (const list of FINDING_LISTS) for (const f of result[list]) pushFinding(f);
  for (const section of result.specializedSections)
    for (const item of section.items) pushFinding(item);
  return refs;
}

/**
 * Tokens that must never change during translation: numbers (with separators
 * and decimals), percentages, and 4-digit years. The guard compares the
 * multiset of these tokens between the source and the translated string.
 */
const PRESERVE_TOKEN = /\d[\d.,:/-]*\d|\d%?/g;

function tokenCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of text.matchAll(PRESERVE_TOKEN)) {
    counts.set(m[0], (counts.get(m[0]) ?? 0) + 1);
  }
  return counts;
}

/** True when the translation keeps every number/date token of the source. */
function numbersPreserved(source: string, translated: string): boolean {
  const want = tokenCounts(source);
  const have = tokenCounts(translated);
  if (want.size !== have.size) return false;
  for (const [token, n] of want) if (have.get(token) !== n) return false;
  return true;
}

/** Group field refs into batches whose prompt stays under the char limit. */
function batchRefs(refs: FieldRef[], language: string): FieldRef[][] {
  const batches: FieldRef[][] = [];
  let current: FieldRef[] = [];
  for (const ref of refs) {
    const trial = [...current, ref];
    const fields = Object.fromEntries(trial.map((r, i) => [String(i), r.get()]));
    if (
      current.length > 0 &&
      buildTranslatePrompt(fields, language).length > TRANSLATE_BATCH_CHAR_LIMIT
    ) {
      batches.push(current);
      current = [ref];
    } else {
      current = trial;
    }
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

const translationReplySchema = z.record(z.string(), z.string());

export type TranslateResult = {
  result: AnalysisResult;
  /** True when translation was rejected and the original was kept. */
  limitationAdded: boolean;
};

const UNAVAILABLE_LIMITATION =
  "Translation was unavailable; the explanation is shown in its original language.";

/**
 * Translate only the user-facing text of an analysis into `language`. EN (the
 * source) is returned unchanged with no chat messages. Every non-text field is
 * preserved structurally: the result is a deep clone of the source and only the
 * collected text refs are overwritten. If any batch alters a number or date,
 * the whole translation is retried once; a second failure falls back to the
 * original text and appends a limitation.
 */
export async function translateAnalysis(
  source: AnalysisResult,
  language: ExplanationLanguage,
  chat: ChatProvider,
): Promise<TranslateResult> {
  if (language === "EN") return { result: source, limitationAdded: false };

  const translated = await attemptTranslation(source, language, chat);
  if (translated) return { result: translated, limitationAdded: false };

  // Retry once, then fall back to the original with a limitation.
  const retried = await attemptTranslation(source, language, chat);
  if (retried) return { result: retried, limitationAdded: false };

  const fallback: AnalysisResult = structuredClone(source);
  fallback.limitations = [...fallback.limitations, UNAVAILABLE_LIMITATION];
  return { result: fallback, limitationAdded: true };
}

/**
 * One translation pass: a clone with its text refs replaced by the model's
 * output. Returns null if any batch changed a number/date (so the caller can
 * retry or fall back).
 */
async function attemptTranslation(
  source: AnalysisResult,
  language: ExplanationLanguage,
  chat: ChatProvider,
): Promise<AnalysisResult | null> {
  const draft: AnalysisResult = structuredClone(source);
  const refs = collectFieldRefs(draft);
  const { sessionId } = await chat.openSession();

  for (const batch of batchRefs(refs, language)) {
    const fields = Object.fromEntries(batch.map((r, i) => [String(i), r.get()]));
    const reply = await requestJson(
      chat,
      sessionId,
      buildTranslatePrompt(fields, language),
      translationReplySchema,
    );
    for (let i = 0; i < batch.length; i++) {
      const sourceText = batch[i].get();
      const value = reply[String(i)];
      if (value === undefined || !numbersPreserved(sourceText, value))
        return null;
      batch[i].set(value);
    }
  }
  return draft;
}

/* -------------------------------------------------------------------------- */
/* TRANSLATE job handler                                                      */
/* -------------------------------------------------------------------------- */

export type TranslateJobDeps = {
  loadSource: (analysisId: string) => Promise<AnalysisResult>;
  loadCached: (
    analysisId: string,
    language: string,
  ) => Promise<AnalysisResult | null>;
  saveTranslation: (
    analysisId: string,
    language: string,
    result: AnalysisResult,
  ) => Promise<void>;
  chat: ChatProvider;
};

type TranslatePayload = { analysisId: string; language: ExplanationLanguage };

/**
 * TRANSLATE: produce and cache a translated analysis for (analysisId, language).
 * A cached row short-circuits with no chat messages. The source analysis is
 * reused as-is; only its text is translated. No OCR or re-analysis is triggered.
 */
export function makeTranslateHandler(deps: TranslateJobDeps): JobHandler {
  return async (job): Promise<JobOutcome> => {
    const { analysisId, language } = job.payload as unknown as TranslatePayload;
    if (language === "EN") return { kind: "done" };

    const cached = await deps.loadCached(analysisId, language);
    if (cached) return { kind: "done" };

    const source = await deps.loadSource(analysisId);
    const { result, limitationAdded } = await translateAnalysis(
      source,
      language,
      deps.chat,
    );
    if (limitationAdded) {
      logger.info("translation unavailable; stored original language", {
        jobId: job.id,
      });
    }
    await deps.saveTranslation(analysisId, language, result);
    return { kind: "done" };
  };
}

/**
 * Load the stored, validated analysis translation for (analysisId, language),
 * or null when it has not been produced yet. EN has no row (it is the source).
 */
export async function getAnalysisInLanguage(
  analysisId: string,
  language: ExplanationLanguage,
): Promise<AnalysisResult | null> {
  if (language === "EN") return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from("analysis_translations")
    .select("translated_json, analysis_id")
    .eq("analysis_id", analysisId)
    .eq("language", language)
    .maybeSingle();
  if (!data) return null;
  const docId = await loadAnalysisDocumentId(analysisId);
  return parseAnalysisResult(data.translated_json, { documentId: docId });
}

async function loadAnalysisDocumentId(analysisId: string): Promise<string> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("document_analyses")
    .select("document_id")
    .eq("id", analysisId)
    .single();
  if (error || !data) throw new Error("analysis not found for translation");
  return data.document_id as string;
}

/** Production-wired TRANSLATE dependencies. */
function defaultDeps(): TranslateJobDeps {
  const admin = createAdminClient();
  return {
    async loadSource(analysisId) {
      const docId = await loadAnalysisDocumentId(analysisId);
      const { data, error } = await admin
        .from("document_analyses")
        .select("report_json")
        .eq("id", analysisId)
        .single();
      if (error || !data) throw new Error("analysis not found for translation");
      return parseAnalysisResult(data.report_json, { documentId: docId });
    },
    async loadCached(analysisId, language) {
      const { data } = await admin
        .from("analysis_translations")
        .select("translated_json")
        .eq("analysis_id", analysisId)
        .eq("language", language)
        .maybeSingle();
      if (!data) return null;
      const docId = await loadAnalysisDocumentId(analysisId);
      return parseAnalysisResult(data.translated_json, { documentId: docId });
    },
    async saveTranslation(analysisId, language, result) {
      const docId = await loadAnalysisDocumentId(analysisId);
      const { data: doc } = await admin
        .from("documents")
        .select("user_id")
        .eq("id", docId)
        .single();
      // Keyed unique on (analysis_id, language); upsert is idempotent.
      const { error } = await admin.from("analysis_translations").upsert(
        {
          analysis_id: analysisId,
          user_id: doc?.user_id as string,
          language,
          translated_json: result as unknown as Record<string, unknown>,
        },
        { onConflict: "analysis_id,language" },
      );
      if (error) throw error;
    },
    chat: getChatProvider(),
  };
}

export function registerTranslateHandler(): void {
  registerJobHandler("TRANSLATE", makeTranslateHandler(defaultDeps()));
}
