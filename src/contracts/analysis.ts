/**
 * AnalysisResult contract, version 1.0.0, from product.md section 15.
 * Shape rules live in the schemas; cross-reference rules live in
 * parseAnalysisResult.
 */
import { z } from "zod";
import {
  documentCategorySchema,
  explanationLanguageSchema,
  informationStatusSchema,
  severitySchema,
} from "@/contracts/common";
import { ContractError } from "@/contracts/errors";

export const ANALYSIS_SCHEMA_VERSION = "1.0.0";

export const evidenceReferenceSchema = z
  .object({
    id: z.string().min(1),
    documentId: z.string().min(1),
    pageNumber: z.number().int().positive(),
    excerpt: z.string().min(1),
    sourceType: z.enum(["OCR_TEXT", "USER_CORRECTION"]),
    wordStart: z.number().int().nonnegative().optional(),
    wordEnd: z.number().int().nonnegative().optional(),
    matchConfidence: z.number().min(0).max(1).optional(),
  })
  .refine(
    (e) =>
      e.wordStart === undefined ||
      e.wordEnd === undefined ||
      e.wordEnd >= e.wordStart,
    { message: "wordEnd must be >= wordStart" },
  );
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

/** An explicit consequence cannot be an inference. */
export const consequenceSchema = findingSchema
  .extend({ kind: z.enum(["EXPLICIT", "INFERRED"]) })
  .refine(
    (c) => !(c.kind === "EXPLICIT" && c.informationStatus === "INFERRED"),
    { message: "An EXPLICIT consequence cannot have INFERRED status" },
  );

export const importantDateSchema = findingSchema.extend({
  date: z.string().nullable(), // ISO 8601 when parseable
  dateText: z.string().min(1), // as written in the document
});

export const reviewRequirementSchema = z.object({
  id: z.string().min(1),
  field: z.string().min(1),
  reason: z.string().min(1),
  impact: z.string().min(1),
  impactLevel: z.enum(["CRITICAL", "HIGH", "MEDIUM", "LOW"]),
  pageNumber: z.number().int().positive(),
  reviewStatus: z.enum(["REQUIRED", "OPTIONAL", "RESOLVED"]),
  findingId: z.string().min(1).optional(),
  evidenceId: z.string().min(1).optional(),
});

export const specializedSectionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  items: z.array(findingSchema),
});

export const analysisResultSchema = z.object({
  schemaVersion: z.string(),
  document: z.object({
    documentId: z.string().min(1),
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
  analysisMetadata: z
    .object({
      modelInstanceId: z.string().nullable(),
      generatedAt: z.string(),
      analysisVersion: z.number().int().positive(),
      language: explanationLanguageSchema,
      categoryModules: z.array(z.string()),
      partial: z.boolean(),
      unavailablePages: z.array(z.number().int().positive()),
    })
    .refine((m) => m.partial || m.unavailablePages.length === 0, {
      message: "unavailablePages requires partial: true",
    }),
});
export type AnalysisResult = z.infer<typeof analysisResultSchema>;

const FINDING_LISTS = [
  "keyInformation",
  "obligations",
  "watchouts",
  "consequences",
  "nextSteps",
  "importantDates",
] as const;

/**
 * Validate an analysis payload against the contract, then the cross-reference
 * rules: unique evidence IDs, evidence from the expected document only, and
 * every evidenceIds entry resolved.
 */
export function parseAnalysisResult(
  value: unknown,
  expected: { documentId: string },
): AnalysisResult {
  const result = analysisResultSchema.parse(value);

  const evidenceIds = new Set<string>();
  for (const [index, evidence] of result.evidence.entries()) {
    if (evidenceIds.has(evidence.id)) {
      throw new ContractError(
        `evidence[${index}]`,
        `duplicate evidence ID "${evidence.id}"`,
      );
    }
    evidenceIds.add(evidence.id);
    if (evidence.documentId !== expected.documentId) {
      throw new ContractError(
        `evidence[${index}].documentId`,
        `evidence belongs to "${evidence.documentId}", expected "${expected.documentId}"`,
      );
    }
  }

  for (const list of FINDING_LISTS) {
    for (const [index, finding] of result[list].entries()) {
      for (const evidenceId of finding.evidenceIds) {
        if (!evidenceIds.has(evidenceId)) {
          throw new ContractError(
            `${list}[${index}].evidenceIds`,
            `finding "${finding.id}" references missing evidence "${evidenceId}"`,
          );
        }
      }
    }
  }

  for (const [index, watchout] of result.watchouts.entries()) {
    if (watchout.severity === "CRITICAL" && watchout.evidenceIds.length === 0) {
      throw new ContractError(
        `watchouts[${index}]`,
        `CRITICAL watchout "${watchout.id}" must cite evidence`,
      );
    }
  }

  return result;
}
