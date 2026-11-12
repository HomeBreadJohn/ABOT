import { z } from "zod";

import { informationStatusSchema } from "@/contracts/common";

/**
 * Per-chunk candidate findings. The model returns a `quote` (exact document
 * text) and a `page` number rather than evidence IDs; evidence mapping (B14)
 * resolves these to real evidence references later.
 */
export const chunkFindingSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1),
  explanation: z.string().min(1),
  informationStatus: informationStatusSchema,
  confidence: z.number().min(0).max(1),
  basis: z.string().min(1),
  quote: z.string().min(1),
  page: z.number().int().positive(),
});
export type ChunkFinding = z.infer<typeof chunkFindingSchema>;

export const chunkFindingsSchema = z.object({
  findings: z.array(chunkFindingSchema),
});
export type ChunkFindings = z.infer<typeof chunkFindingsSchema>;
