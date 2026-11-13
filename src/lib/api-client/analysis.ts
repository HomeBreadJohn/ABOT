/** Analysis and page endpoints. Types derive from the contract schemas. */
import type { z } from "zod";

import {
  analysisByIdResponseSchema,
  analysisResponseSchema,
  analyzeRequestSchema,
  analyzeResponseSchema,
  documentPageResponseSchema,
  type ExplanationLanguage,
} from "@/contracts";
import { apiFetch } from "@/lib/api-client/client";

type AnalyzeRequest = z.infer<typeof analyzeRequestSchema>;
type AnalyzeResponse = z.infer<typeof analyzeResponseSchema>;
type AnalysisResponse = z.infer<typeof analysisResponseSchema>;
type AnalysisByIdResponse = z.infer<typeof analysisByIdResponseSchema>;
type DocumentPageResponse = z.infer<typeof documentPageResponseSchema>;

/** POST /api/documents/:id/analyze — START, RETRY, or REANALYZE. */
export function requestAnalysis(
  documentId: string,
  input: AnalyzeRequest,
): Promise<AnalyzeResponse> {
  return apiFetch(`/api/documents/${documentId}/analyze`, {
    method: "POST",
    body: input,
    schema: analyzeResponseSchema,
  });
}

/**
 * GET /api/documents/:id/analysis — the latest analysis or a not-ready status.
 * A READY response may carry `reminderSuggestions` (reminder CRUD itself does
 * not exist; see index.ts).
 */
export function getAnalysis(
  documentId: string,
  language?: ExplanationLanguage,
): Promise<AnalysisResponse> {
  const query = language ? `?language=${language}` : "";
  return apiFetch(`/api/documents/${documentId}/analysis${query}`, {
    schema: analysisResponseSchema,
  });
}

/** GET /api/analyses/:id — a specific SUCCEEDED analysis version. */
export function getAnalysisById(
  analysisId: string,
): Promise<AnalysisByIdResponse> {
  return apiFetch(`/api/analyses/${analysisId}`, {
    schema: analysisByIdResponseSchema,
  });
}

/** GET /api/documents/:id/pages/:pageNumber — page text and words. */
export function getPage(
  documentId: string,
  pageNumber: number,
): Promise<DocumentPageResponse> {
  return apiFetch(`/api/documents/${documentId}/pages/${pageNumber}`, {
    schema: documentPageResponseSchema,
  });
}
