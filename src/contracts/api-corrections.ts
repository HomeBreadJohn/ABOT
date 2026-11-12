/**
 * Correction endpoint contracts.
 */
import { z } from "zod";

export const correctionSchema = z.object({
  id: z.string().min(1),
  pageNumber: z.number().int().positive(),
  wordStart: z.number().int().nonnegative(),
  wordEnd: z.number().int().nonnegative(),
  originalText: z.string(),
  correctedValue: z.string().nullable(),
  createdAt: z.string(),
});

/* POST /api/documents/:id/corrections */
export const submitCorrectionsRequestSchema = z.strictObject({
  items: z
    .array(
      z.strictObject({
        pageNumber: z.number().int().positive(),
        wordStart: z.number().int().nonnegative(),
        wordEnd: z.number().int().nonnegative(),
        correctedValue: z.string().min(1).max(2000).optional(),
      }),
    )
    .min(1),
});

export const submitCorrectionsResponseSchema = z.object({
  corrections: z.array(correctionSchema),
});

/* GET /api/documents/:id/corrections */
export const listCorrectionsRequestSchema = z.strictObject({});
export const listCorrectionsResponseSchema = z.object({
  corrections: z.array(correctionSchema),
});
