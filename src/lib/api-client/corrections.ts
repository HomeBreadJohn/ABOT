/** OCR correction endpoints. Types derive from the contract schemas. */
import type { z } from "zod";

import {
  listCorrectionsResponseSchema,
  submitCorrectionsRequestSchema,
  submitCorrectionsResponseSchema,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type SubmitCorrectionsRequest = z.infer<typeof submitCorrectionsRequestSchema>;
type SubmitCorrectionsResponse = z.infer<typeof submitCorrectionsResponseSchema>;
type ListCorrectionsResponse = z.infer<typeof listCorrectionsResponseSchema>;

/** POST /api/documents/:id/corrections — submit OCR corrections. */
export function submitCorrections(
  documentId: string,
  input: SubmitCorrectionsRequest,
): Promise<SubmitCorrectionsResponse> {
  return apiFetch(`/api/documents/${documentId}/corrections`, {
    method: "POST",
    body: input,
    schema: submitCorrectionsResponseSchema,
  });
}

/** GET /api/documents/:id/corrections — the full correction history. */
export function listCorrections(
  documentId: string,
): Promise<ListCorrectionsResponse> {
  return apiFetch(`/api/documents/${documentId}/corrections`, {
    schema: listCorrectionsResponseSchema,
  });
}
