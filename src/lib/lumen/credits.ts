/**
 * Credit price per Lumen operation, from `docs/lumen/ocr-api.md` and the AI
 * Chat docs. OCR: upload 6, retry 3, review 2, correction 2, every GET 1.
 * AI Chat: session 2, message 5, transcript 1, instances 1.
 */
export type LumenOperation =
  | "ocr_upload"
  | "ocr_retry"
  | "ocr_review"
  | "ocr_correction"
  | "ocr_get_document"
  | "ocr_list_documents"
  | "ocr_get_pages"
  | "ocr_get_page"
  | "ai_session"
  | "ai_message"
  | "ai_transcript"
  | "ai_instances";

export const CREDIT_COST: Record<LumenOperation, number> = {
  ocr_upload: 6,
  ocr_retry: 3,
  ocr_review: 2,
  ocr_correction: 2,
  ocr_get_document: 1,
  ocr_list_documents: 1,
  ocr_get_pages: 1,
  ocr_get_page: 1,
  ai_session: 2,
  ai_message: 5,
  ai_transcript: 1,
  ai_instances: 1,
};
