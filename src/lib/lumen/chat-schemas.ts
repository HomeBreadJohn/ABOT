import { z } from "zod";

/**
 * Zod schemas for the Lumen AI Chat responses, derived only from
 * `docs/lumen/ai-chat-api.md` and `docs/lumen/ai-chat-openapi.yaml`. Unlike the
 * OCR API these bodies are top-level (no `{ data, requestId }` envelope), so
 * callers pass `unwrapEnvelope: false` to `lumenRequest`.
 */

/** GET /instances */
export const chatInstancesSchema = z.object({
  Instances: z.array(
    z.object({
      InstanceID: z.string(),
      Name: z.string(),
      Description: z.string().optional(),
      Status: z.string(),
    }),
  ),
  Count: z.number().int(),
});
export type ChatInstances = z.infer<typeof chatInstancesSchema>;

/** POST /instances/{id}/sessions (201) */
export const chatSessionSchema = z.object({
  Session: z.object({
    id: z.string(),
    organizationID: z.string(),
    title: z.string().optional(),
    isArchived: z.boolean().optional(),
    createdTS: z.number().int().optional(),
    updatedTS: z.number().int().optional(),
    metadata: z.record(z.string(), z.string()).optional(),
  }),
});
export type ChatSession = z.infer<typeof chatSessionSchema>;

/** POST .../messages (200) */
export const chatAnswerSchema = z.object({
  Answer: z.object({
    sessionID: z.string(),
    answer: z.string(),
    citations: z.array(z.string()).optional(),
    degradedSources: z.array(z.string()).optional(),
  }),
});
export type ChatAnswer = z.infer<typeof chatAnswerSchema>;

/** GET .../messages (200) */
export const chatTranscriptSchema = z.object({
  Messages: z.array(
    z.object({
      id: z.string(),
      sessionID: z.string(),
      role: z.enum(["user", "assistant"]),
      content: z.string(),
      createdTS: z.number().int().optional(),
    }),
  ),
  Count: z.number().int(),
});
export type ChatTranscript = z.infer<typeof chatTranscriptSchema>;
