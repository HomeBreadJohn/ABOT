/**
 * PLACEHOLDER (Person 2). Merge with Person 1 before relying on these.
 * Shared enums from product.md sections 3.3, 3.4, 13, 6.
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

export const documentLifecycleSchema = z.enum([
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
