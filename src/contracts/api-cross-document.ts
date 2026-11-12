/**
 * Cross-document endpoint contracts. Combined analysis takes 2-5 document IDs
 * and works from compact findings, never full document text.
 */
import { z } from "zod";
import { documentCategorySchema, relationshipTypeSchema } from "@/contracts/common";

/* POST /api/cross-document/relationships/suggest */
export const suggestRelationshipsRequestSchema = z.strictObject({
  documentIdA: z.string().min(1),
  documentIdB: z.string().min(1),
});

export const relationshipSuggestionSchema = z.object({
  id: z.string().min(1),
  documentIdA: z.string().min(1),
  documentIdB: z.string().min(1),
  type: relationshipTypeSchema,
  confidence: z.number().min(0).max(1),
  matchingEvidenceIds: z.array(z.string()),
});
export const suggestRelationshipsResponseSchema = z.object({
  suggestions: z.array(relationshipSuggestionSchema),
});

/* POST /api/cross-document/relationships */
export const reviewRelationshipRequestSchema = z.strictObject({
  relationshipId: z.string().min(1),
  action: z.enum(["APPROVE", "REJECT"]),
});
export const reviewRelationshipResponseSchema = z.object({
  relationshipId: z.string().min(1),
  type: relationshipTypeSchema,
});

/* POST /api/cross-document/analyze */
export const crossAnalyzeRequestSchema = z.strictObject({
  documentIds: z.array(z.string().min(1)).min(2).max(5),
});
export const crossAnalyzeResponseSchema = z.object({
  crossAnalysisId: z.string().min(1),
  documentIds: z.array(z.string().min(1)),
});

/* GET /api/cross-document/analyses/:id */
export const crossAnalysisFindingSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string(),
  informationStatus: z.enum(["FOUND", "NOT_FOUND", "UNCLEAR", "CONFLICTING", "INFERRED"]),
  sources: z
    .array(
      z.object({
        documentId: z.string().min(1),
        pageNumber: z.number().int().positive(),
      }),
    )
    .min(1),
});

export const crossAnalysisResultSchema = z.object({
  category: documentCategorySchema,
  overview: z.string(),
  explanation: z.string(),
  findings: z.array(crossAnalysisFindingSchema),
  limitations: z.array(z.string()),
});

export const crossAnalysisResponseSchema = z
  .object({
    crossAnalysisId: z.string().min(1),
    documentIds: z.array(z.string().min(1)),
    status: z.enum(["RUNNING", "SUCCEEDED", "FAILED"]),
    result: crossAnalysisResultSchema.optional(),
  })
  .refine(
    (value) => value.status !== "SUCCEEDED" || value.result !== undefined,
    { message: "A SUCCEEDED cross-analysis must include a result" },
  );
