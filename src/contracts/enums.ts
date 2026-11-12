/**
 * SHARED CONTRACT (PROPOSAL) - enums.
 *
 * Owned jointly by Person 1 (Platform/UI) and Person 2 (Intelligence).
 * Status: PROPOSED. Not final until both owners approve it in a reviewed PR.
 * Do not edit from only one branch. See product.md sections 3, 13 and 15.
 */
import { z } from "zod";

/** Bump when the AnalysisResult shape changes. */
export const ANALYSIS_SCHEMA_VERSION = "0.1.0-proposal" as const;

/** product.md 3.4 - separate from `confidence`. */
export const INFORMATION_STATUSES = [
  "FOUND",
  "NOT_FOUND",
  "UNCLEAR",
  "CONFLICTING",
  "INFERRED",
] as const;
export const informationStatusSchema = z.enum(INFORMATION_STATUSES);
export type InformationStatus = z.infer<typeof informationStatusSchema>;

/** product.md 3.3 */
export const SEVERITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const severitySchema = z.enum(SEVERITIES);
export type Severity = z.infer<typeof severitySchema>;

/** product.md 3.2 */
export const DOCUMENT_CATEGORIES = [
  "GOVERNMENT",
  "FINANCIAL",
  "EMPLOYMENT",
  "LEGAL",
  "MEDICAL",
  "EDUCATION",
  "UTILITIES",
  "PERSONAL",
  "OTHER",
] as const;
export const documentCategorySchema = z.enum(DOCUMENT_CATEGORIES);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

/** product.md 7. "en" is the default (Filipino-friendly English). */
export const LANGUAGES = ["en", "fil", "taglish"] as const;
export const languageSchema = z.enum(LANGUAGES);
export type Language = z.infer<typeof languageSchema>;

/** product.md 15 - each consequence must be EXPLICIT or INFERRED. */
export const CONSEQUENCE_TYPES = ["EXPLICIT", "INFERRED"] as const;
export const consequenceTypeSchema = z.enum(CONSEQUENCE_TYPES);
export type ConsequenceType = z.infer<typeof consequenceTypeSchema>;

/** product.md 3.1.C */
export const WATCHOUT_TYPES = [
  "UNUSUAL_CONDITION",
  "PENALTY",
  "ADDITIONAL_FEE",
  "RESTRICTIVE_CLAUSE",
  "DEADLINE",
  "MISSING_INFORMATION",
  "CONTRADICTION",
] as const;
export const watchoutTypeSchema = z.enum(WATCHOUT_TYPES);
export type WatchoutType = z.infer<typeof watchoutTypeSchema>;

/** product.md 3.1.F */
export const NEXT_STEP_TYPES = [
  "ACTION",
  "VERIFY",
  "ASK",
  "CHECKLIST",
  "REMINDER",
] as const;
export const nextStepTypeSchema = z.enum(NEXT_STEP_TYPES);
export type NextStepType = z.infer<typeof nextStepTypeSchema>;

export const IMPORTANT_DATE_TYPES = [
  "DEADLINE",
  "EVENT",
  "VALID_FROM",
  "VALID_UNTIL",
  "OTHER",
] as const;
export const importantDateTypeSchema = z.enum(IMPORTANT_DATE_TYPES);
export type ImportantDateType = z.infer<typeof importantDateTypeSchema>;

/** product.md 15 only names `sourceType`; the values are a PROPOSAL. */
export const EVIDENCE_SOURCE_TYPES = ["OCR_TEXT", "USER_CORRECTION"] as const;
export const evidenceSourceTypeSchema = z.enum(EVIDENCE_SOURCE_TYPES);
export type EvidenceSourceType = z.infer<typeof evidenceSourceTypeSchema>;

export const LIMITATION_SCOPES = ["DOCUMENT", "PAGE", "ANALYSIS"] as const;
export const limitationScopeSchema = z.enum(LIMITATION_SCOPES);
export type LimitationScope = z.infer<typeof limitationScopeSchema>;

/** product.md 5.4 - automatic text never appears here. */
export const REVIEW_LEVELS = ["OPTIONAL", "REQUIRED"] as const;
export const reviewLevelSchema = z.enum(REVIEW_LEVELS);
export type ReviewLevel = z.infer<typeof reviewLevelSchema>;

export const REVIEW_STATUSES = [
  "PENDING",
  "CONFIRMED",
  "CORRECTED",
  "DISMISSED",
] as const;
export const reviewStatusSchema = z.enum(REVIEW_STATUSES);
export type ReviewStatus = z.infer<typeof reviewStatusSchema>;

/**
 * product.md 13 - document lifecycle.
 * PROPOSAL: NEEDS_CORRECTION means at least one REQUIRED review item is
 * pending; any report shown is provisional. REVIEW_REQUIRED means only
 * OPTIONAL review items are pending. COMPLETED means no review item is
 * pending.
 */
export const DOCUMENT_STATUSES = [
  "UPLOADED",
  "OCR_PROCESSING",
  "OCR_READY",
  "OCR_PARTIAL",
  "OCR_FAILED",
  "ANALYZING",
  "NEEDS_CORRECTION",
  "REVIEW_REQUIRED",
  "ANALYSIS_FAILED",
  "COMPLETED",
] as const;
export const documentStatusSchema = z.enum(DOCUMENT_STATUSES);
export type DocumentStatus = z.infer<typeof documentStatusSchema>;

/**
 * Allowed lifecycle transitions. Retry paths are included so that failures
 * can recover, but nothing may move to COMPLETED except from ANALYZING or
 * REVIEW_REQUIRED, so a failed analysis is never shown as complete.
 */
export const DOCUMENT_STATUS_TRANSITIONS: Record<
  DocumentStatus,
  readonly DocumentStatus[]
> = {
  UPLOADED: ["OCR_PROCESSING"],
  OCR_PROCESSING: ["OCR_READY", "OCR_PARTIAL", "OCR_FAILED"],
  OCR_READY: ["ANALYZING"],
  OCR_PARTIAL: ["ANALYZING", "OCR_PROCESSING"],
  OCR_FAILED: ["OCR_PROCESSING"],
  ANALYZING: [
    "NEEDS_CORRECTION",
    "REVIEW_REQUIRED",
    "COMPLETED",
    "ANALYSIS_FAILED",
  ],
  NEEDS_CORRECTION: ["ANALYZING"],
  REVIEW_REQUIRED: ["COMPLETED", "ANALYZING"],
  ANALYSIS_FAILED: ["ANALYZING"],
  COMPLETED: ["ANALYZING"],
};

export function canTransition(from: DocumentStatus, to: DocumentStatus) {
  return DOCUMENT_STATUS_TRANSITIONS[from].includes(to);
}

export const ANALYSIS_STATUSES = [
  "QUEUED",
  "RUNNING",
  "COMPLETED",
  "FAILED",
] as const;
export const analysisStatusSchema = z.enum(ANALYSIS_STATUSES);
export type AnalysisStatus = z.infer<typeof analysisStatusSchema>;
