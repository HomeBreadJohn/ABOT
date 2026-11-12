/**
 * Shared enums, lifecycle, and transitions. Single source of truth from
 * product.md sections 3.2-3.4, 5.1, 6.2, 7, and 13.
 */
import { z } from "zod";

export const severitySchema = z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]);
export type Severity = z.infer<typeof severitySchema>;

export const informationStatusSchema = z.enum([
  "FOUND",
  "NOT_FOUND",
  "UNCLEAR",
  "CONFLICTING",
  "INFERRED",
]);
export type InformationStatus = z.infer<typeof informationStatusSchema>;

export const processingStageSchema = z.enum([
  "RECEIVED",
  "READING",
  "UNDERSTANDING",
  "CHECKING_DETAILS",
  "PREPARING_REPORT",
]);
export type ProcessingStage = z.infer<typeof processingStageSchema>;

export const documentLifecycleSchema = z.enum([
  "AWAITING_UPLOAD",
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
]);
export type DocumentLifecycle = z.infer<typeof documentLifecycleSchema>;

export const documentCategorySchema = z.enum([
  "GOVERNMENT",
  "FINANCIAL",
  "EMPLOYMENT",
  "LEGAL",
  "MEDICAL",
  "EDUCATION",
  "UTILITIES",
  "PERSONAL",
  "OTHER",
]);
export type DocumentCategory = z.infer<typeof documentCategorySchema>;

export const relationshipTypeSchema = z.enum([
  "POSSIBLE_MATCH",
  "CONFIRMED_MATCH",
  "CONTRADICTS",
  "SUPPLEMENTS",
  "SUPERSEDES",
  "UNRELATED",
]);
export type RelationshipType = z.infer<typeof relationshipTypeSchema>;

export const explanationLanguageSchema = z.enum(["EN", "FIL", "TAGLISH"]);
export type ExplanationLanguage = z.infer<typeof explanationLanguageSchema>;

export const allowedMimeTypeSchema = z.enum([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/tiff",
  "image/webp",
]);
export type AllowedMimeType = z.infer<typeof allowedMimeTypeSchema>;

export const MAX_DOCUMENT_SIZE_BYTES = 10485760;

/**
 * Allowed lifecycle transitions. A failed analysis never becomes complete
 * without rerunning (ANALYSIS_FAILED can only go back to ANALYZING).
 */
export const LIFECYCLE_TRANSITIONS: Record<
  DocumentLifecycle,
  readonly DocumentLifecycle[]
> = {
  AWAITING_UPLOAD: ["UPLOADED"],
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
  REVIEW_REQUIRED: ["ANALYZING", "COMPLETED"],
  ANALYSIS_FAILED: ["ANALYZING"],
  COMPLETED: ["ANALYZING"],
};

export function canTransition(
  from: DocumentLifecycle,
  to: DocumentLifecycle,
): boolean {
  return LIFECYCLE_TRANSITIONS[from].includes(to);
}

const STAGE_BY_JOB_STEP: Record<number, ProcessingStage> = {
  1: "UNDERSTANDING",
  2: "CHECKING_DETAILS",
  3: "PREPARING_REPORT",
};

/** User-facing stage label for a lifecycle state (and job step while analyzing). */
export function lifecycleToStage(
  lifecycle: DocumentLifecycle,
  jobStep?: number,
): ProcessingStage {
  switch (lifecycle) {
    case "AWAITING_UPLOAD":
    case "UPLOADED":
      return "RECEIVED";
    case "OCR_PROCESSING":
    case "OCR_READY":
    case "OCR_PARTIAL":
    case "OCR_FAILED":
      return "READING";
    case "ANALYZING":
      return STAGE_BY_JOB_STEP[jobStep ?? 1] ?? "UNDERSTANDING";
    default:
      // Post-analysis states: the report exists or is being decided on.
      return "PREPARING_REPORT";
  }
}
