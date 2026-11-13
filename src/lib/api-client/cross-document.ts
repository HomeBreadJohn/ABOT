/** Cross-document relationship and analysis endpoints. */
import type { z } from "zod";

import {
  crossAnalysisResponseSchema,
  crossAnalyzeRequestSchema,
  crossAnalyzeResponseSchema,
  reviewRelationshipRequestSchema,
  reviewRelationshipResponseSchema,
  suggestRelationshipsRequestSchema,
  suggestRelationshipsResponseSchema,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type SuggestRelationshipsRequest = z.infer<typeof suggestRelationshipsRequestSchema>;
type SuggestRelationshipsResponse = z.infer<typeof suggestRelationshipsResponseSchema>;
type ReviewRelationshipRequest = z.infer<typeof reviewRelationshipRequestSchema>;
type ReviewRelationshipResponse = z.infer<typeof reviewRelationshipResponseSchema>;
type CrossAnalyzeRequest = z.infer<typeof crossAnalyzeRequestSchema>;
type CrossAnalyzeResponse = z.infer<typeof crossAnalyzeResponseSchema>;
type CrossAnalysisResponse = z.infer<typeof crossAnalysisResponseSchema>;

/** POST /api/cross-document/relationships/suggest — identifier-match suggestions. */
export function suggestRelationships(
  input: SuggestRelationshipsRequest,
): Promise<SuggestRelationshipsResponse> {
  return apiFetch("/api/cross-document/relationships/suggest", {
    method: "POST",
    body: input,
    schema: suggestRelationshipsResponseSchema,
  });
}

/** POST /api/cross-document/relationships — approve or reject a suggestion. */
export function reviewRelationship(
  input: ReviewRelationshipRequest,
): Promise<ReviewRelationshipResponse> {
  return apiFetch("/api/cross-document/relationships", {
    method: "POST",
    body: input,
    schema: reviewRelationshipResponseSchema,
  });
}

/** POST /api/cross-document/analyze — start a combined analysis of 2-5 documents. */
export function requestCrossAnalysis(
  input: CrossAnalyzeRequest,
): Promise<CrossAnalyzeResponse> {
  return apiFetch("/api/cross-document/analyze", {
    method: "POST",
    body: input,
    schema: crossAnalyzeResponseSchema,
  });
}

/** GET /api/cross-document/analyses/:id — a combined analysis result. */
export function getCrossAnalysis(
  crossAnalysisId: string,
): Promise<CrossAnalysisResponse> {
  return apiFetch(`/api/cross-document/analyses/${crossAnalysisId}`, {
    schema: crossAnalysisResponseSchema,
  });
}
