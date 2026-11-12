/**
 * PLACEHOLDER (Person 2). Draft of AnalysisResult from product.md section 15.
 * Not agreed with Person 1 yet. See todo-human.md before changing or consuming.
 */
import { z } from "zod";
import {
  documentCategorySchema,
  informationStatusSchema,
  severitySchema,
} from "@/contracts/common";

export const ANALYSIS_SCHEMA_VERSION = "0.1.0-draft";

export const evidenceReferenceSchema = z.object({
  id: z.string().min(1),
  documentId: z.string().min(1),
  pageNumber: z.number().int().positive(),
  excerpt: z.string().min(1),
  sourceType: z.enum(["OCR_TEXT", "USER_CORRECTION"]),
});
export type EvidenceReference = z.infer<typeof evidenceReferenceSchema>;

export const findingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  severity: severitySchema.optional(),
  informationStatus: informationStatusSchema,
  confidence: z.number().min(0).max(1),
  basis: z.string().min(1),
  evidenceIds: z.array(z.string()),
});
export type Finding = z.infer<typeof findingSchema>;

export const consequenceSchema = findingSchema.extend({
  kind: z.enum(["EXPLICIT", "INFERRED"]),
});

export const importantDateSchema = findingSchema.extend({
  date: z.string().nullable(), // ISO 8601 when parseable
  dateText: z.string().min(1), // as written in the document
});

export const reviewRequirementSchema = z.object({
  field: z.string().min(1),
  reason: z.string().min(1),
  impact: z.string().min(1),
  pageNumber: z.number().int().positive(),
  reviewStatus: z.enum(["REQUIRED", "OPTIONAL", "RESOLVED"]),
});

export const specializedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(findingSchema),
});

export const analysisResultSchema = z.object({
  schemaVersion: z.string(),
  document: z.object({
    documentType: documentCategorySchema,
    documentSubtype: z.string().nullable(),
    issuer: z.string().nullable(),
    classificationConfidence: z.number().min(0).max(1),
  }),
  overview: z.string(),
  explanation: z.string(),
  keyInformation: z.array(findingSchema),
  obligations: z.array(findingSchema),
  watchouts: z.array(findingSchema),
  consequences: z.array(consequenceSchema),
  nextSteps: z.array(findingSchema),
  importantDates: z.array(importantDateSchema),
  specializedSections: z.array(specializedSectionSchema),
  evidence: z.array(evidenceReferenceSchema),
  limitations: z.array(z.string()),
  reviewRequirements: z.array(reviewRequirementSchema),
  analysisMetadata: z.object({
    modelInstanceId: z.string().nullable(),
    generatedAt: z.string(),
    partial: z.boolean(),
    unavailablePages: z.array(z.number().int().positive()),
  }),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;
