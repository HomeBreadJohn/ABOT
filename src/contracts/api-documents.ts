/**
 * Document and analysis endpoint contracts. Split by area; re-exported from
 * api.ts. Request bodies are strict so unknown fields (including owner IDs a
 * client may try to send) fail parsing.
 */
import { z } from "zod";
import {
  allowedMimeTypeSchema,
  documentCategorySchema,
  documentLifecycleSchema,
  explanationLanguageSchema,
  MAX_DOCUMENT_SIZE_BYTES,
  processingStageSchema,
} from "@/contracts/common";
import { apiErrorCodeSchema } from "@/contracts/api-error";
import { analysisResultSchema } from "@/contracts/analysis";

/* POST /api/documents */
export const createDocumentRequestSchema = z.strictObject({
  originalFilename: z.string().trim().min(1).max(255),
  mimeType: allowedMimeTypeSchema,
  fileSize: z.number().int().positive().max(MAX_DOCUMENT_SIZE_BYTES),
});
export type CreateDocumentRequest = z.infer<typeof createDocumentRequestSchema>;

export const createDocumentResponseSchema = z.object({
  documentId: z.uuid(),
  storagePath: z.string().min(1),
  uploadToken: z.string().min(1),
  uploadUrl: z.url(),
});

/* POST /api/documents/:id/upload-complete */
export const uploadCompleteRequestSchema = z.strictObject({});
export const uploadCompleteResponseSchema = z.object({
  documentId: z.uuid(),
  lifecycle: documentLifecycleSchema,
});

/* GET /api/documents */
export const documentListItemSchema = z.object({
  documentId: z.uuid(),
  title: z.string(),
  lifecycle: documentLifecycleSchema,
  stage: processingStageSchema,
  // Classification has not run for a document in AWAITING_UPLOAD.
  category: documentCategorySchema.nullable(),
  analysisStatus: z.enum(["NONE", "RUNNING", "SUCCEEDED", "FAILED"]),
  nextDeadline: z.string().nullable(),
  needsAttention: z.boolean(),
  createdAt: z.string(),
});
export const documentListResponseSchema = z.object({
  documents: z.array(documentListItemSchema),
});

/* GET /api/documents/:id */
export const documentDetailResponseSchema = documentListItemSchema.extend({
  subtype: z.string().nullable(),
  mimeType: allowedMimeTypeSchema,
  fileSize: z.number().int().positive(),
  originalFilename: z.string(),
  updatedAt: z.string(),
  latestAnalysisId: z.string().nullable(),
});

/* PATCH /api/documents/:id */
export const updateDocumentRequestSchema = z.strictObject({
  title: z.string().trim().min(1).max(255).optional(),
  category: documentCategorySchema.optional(),
});

/* DELETE /api/documents/:id */
export const deleteDocumentRequestSchema = z.strictObject({});
export const deleteDocumentResponseSchema = z.object({
  documentId: z.uuid(),
  note: z.string(),
});

/* POST /api/documents/:id/analyze */
export const analyzeRequestSchema = z.strictObject({
  mode: z.enum(["START", "RETRY", "REANALYZE"]),
  idempotencyKey: z.string().min(1),
});
export const analyzeResponseSchema = z.object({
  documentId: z.uuid(),
  jobId: z.uuid(),
});

/* GET /api/documents/:id/pages/:pageNumber */
export const documentWordSchema = z.object({
  index: z.number().int().nonnegative(),
  text: z.string(),
  confidence: z.number().min(0).max(1).nullable(),
});
export const documentPageResponseSchema = z.object({
  pageNumber: z.number().int().positive(),
  status: z.enum(["READY", "FAILED"]),
  text: z.string(),
  words: z.array(documentWordSchema),
  averageConfidence: z.number().min(0).max(1).nullable(),
});

/* GET /api/documents/:id/analysis?language= */
export const getAnalysisQuerySchema = z.strictObject({
  language: explanationLanguageSchema.optional(),
});

export const analysisResponseSchema = z.discriminatedUnion("state", [
  z.strictObject({
    state: z.literal("READY"),
    analysisId: z.uuid(),
    version: z.number().int().positive(),
    analysis: analysisResultSchema,
    // True when a non-source language was requested and its translation is not
    // ready yet: the original (source-language) analysis is returned meanwhile.
    translationPending: z.boolean().optional(),
  }),
  z.strictObject({
    state: z.literal("PROCESSING"),
    stage: processingStageSchema,
  }),
  z.strictObject({
    state: z.literal("FAILED"),
    errorCode: apiErrorCodeSchema,
    message: z.string(),
  }),
]);
export type AnalysisResponse = z.infer<typeof analysisResponseSchema>;

/* GET /api/analyses/:id */
export const analysisByIdResponseSchema = z.object({
  analysisId: z.uuid(),
  documentId: z.uuid(),
  version: z.number().int().positive(),
  generatedAt: z.string(),
  analysis: analysisResultSchema,
});
