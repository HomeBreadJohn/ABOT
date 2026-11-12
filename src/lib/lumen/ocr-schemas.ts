import { z } from "zod";

/**
 * Zod schemas for the Lumen OCR responses, derived from
 * `docs/lumen/ocr-openapi.yaml` and the captured staging fixtures in
 * `__fixtures__/ocr`. Every JSON success body is wrapped `{ data, requestId }`;
 * these schemas validate the unwrapped `data` payload.
 */

export const ocrStatusSchema = z.enum([
  "PENDING",
  "PROCESSING",
  "READY",
  "PARTIAL",
  "FAILED",
]);

const mediaTypeSchema = z.enum([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/tiff",
  "image/webp",
]);

const engineSchema = z.object({
  name: z.string(),
  version: z.string(),
  unit: z.enum(["word", "line", "block", "page"]),
});

/** The document record returned by GET /documents/{id} (and upload/retry 2xx). */
export const ocrDocumentSchema = z.object({
  DocumentID: z.string(),
  Name: z.string(),
  MediaType: mediaTypeSchema,
  ByteSize: z.number().int(),
  PageCount: z.number().int(),
  Status: ocrStatusSchema,
  FailedPageNumbers: z.array(z.number().int()),
  CreatedTS: z.number().int(),
  Engine: engineSchema.optional(),
  FailureReason: z
    .enum([
      "timeout",
      "unavailable",
      "unsupported_media",
      "corrupt_document",
      "invalid_request",
    ])
    .optional(),
  ReadCompletedTS: z.number().int().optional(),
});
export type OcrDocument = z.infer<typeof ocrDocumentSchema>;

/**
 * A word's confidence. When `measured` is true the engine reports a numeric
 * `value`; when false it carries a `reason` and no score. Captured fixtures are
 * frequently `{ measured: false, reason: "not_reported" }`.
 */
const confidenceSchema = z.object({
  measured: z.boolean(),
  value: z.number().optional(),
  unit: z.enum(["word", "line", "block", "page"]).optional(),
  reason: z.string().optional(),
});

const wordSchema = z.object({
  text: z.string(),
  box: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }),
  confidence: confidenceSchema,
});

const pageSchema = z.object({
  DocumentID: z.string(),
  PageNumber: z.number().int(),
  Origin: z.string(),
  ToSource: z.record(z.string(), z.number()),
  Raster: z.object({
    widthPx: z.number(),
    heightPx: z.number(),
    dpi: z.number(),
  }),
  Confidence: confidenceSchema,
  // Present when the list was requested with IncludeWords=true.
  Words: z.array(wordSchema),
  Lines: z.array(z.unknown()).optional(),
});
export type OcrPage = z.infer<typeof pageSchema>;

/** GET /documents/{id}/pages?IncludeWords=true payload. */
export const ocrPagesSchema = z.object({
  Items: z.array(pageSchema),
  IncludesWords: z.boolean(),
  ContinuationToken: z.string().optional(),
});
export type OcrPages = z.infer<typeof ocrPagesSchema>;

/** POST /documents 202 payload; only DocumentID is needed downstream. */
export const ocrUploadResponseSchema = z.object({
  DocumentID: z.string(),
});
