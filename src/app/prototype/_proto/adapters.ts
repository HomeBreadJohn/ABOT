/**
 * Adapters from the real /api contract shapes to the prototype's ProtoDoc shape,
 * so the existing screens render real data without being rewritten. Only the
 * four wired flows (upload, vault/home list, processing, report) use these.
 */
import type { AnalysisResponse } from "@/contracts/api-documents";
import type { z } from "zod";

import type {
  documentListItemSchema,
  documentPageResponseSchema,
} from "@/contracts/api-documents";
import type { ProcessingStage } from "@/contracts/common";

import { finalLifecycle, TODAY, type DocPage, type ProtoDoc } from "./data";

type DocumentListItem = z.infer<typeof documentListItemSchema>;
type DocumentPageResponse = z.infer<typeof documentPageResponseSchema>;

/** Prototype step index (0-4) that the processing screen's stepper reads. */
const STEP_BY_STAGE: Record<ProcessingStage, number> = {
  RECEIVED: 0,
  READING: 1,
  UNDERSTANDING: 2,
  CHECKING_DETAILS: 3,
  PREPARING_REPORT: 4,
};

export function stageToStep(stage: ProcessingStage): number {
  return STEP_BY_STAGE[stage] ?? 0;
}

/** A vault/home list row -> a summary ProtoDoc (no analysis or pages yet). */
export function listItemToProtoDoc(item: DocumentListItem): ProtoDoc {
  return {
    id: item.documentId,
    title: item.title,
    filename: item.title,
    category: item.category,
    uploadedAt: item.createdAt.slice(0, 10) || TODAY,
    lifecycle: item.lifecycle,
    step: stageToStep(item.stage),
    analysis: null,
    pending: null,
    pages: [],
    corrections: [],
    real: true,
  };
}

/** Real OCR page text -> the prototype's DocPage used by the report's Original tab. */
export function pageToDocPage(page: DocumentPageResponse): DocPage {
  if (page.status === "FAILED")
    return { number: page.pageNumber, lines: [], unavailable: true };
  const lines = page.text
    .split("\n")
    .map((text) => ({ text }))
    .filter((l) => l.text.length > 0);
  return { number: page.pageNumber, lines };
}

/**
 * A GET /analysis response -> a ProtoDoc patch. Drives the processing stepper
 * and, when READY, attaches the real analysis so the report renders. The patch
 * is merged onto the current doc by the store's syncDoc action.
 */
export function mergeAnalysisResponse(res: AnalysisResponse): Partial<ProtoDoc> {
  switch (res.state) {
    case "READY": {
      const analysis = res.analysis;
      return {
        analysis,
        pending: null,
        category: analysis.document.documentType,
        // Derive COMPLETED / REVIEW_REQUIRED / NEEDS_CORRECTION from the analysis.
        lifecycle: finalLifecycle(analysis),
        step: 4,
        error: undefined,
      };
    }
    case "PROCESSING":
      return {
        lifecycle: "ANALYZING",
        step: stageToStep(res.stage),
        error: undefined,
      };
    case "FAILED":
      return {
        lifecycle: "ANALYSIS_FAILED",
        error: res.message,
      };
  }
}
