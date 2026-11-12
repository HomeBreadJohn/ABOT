import "server-only";

import { registerOcrHandlers } from "@/features/ocr/services/ocr-jobs";
import { registerAnalysisHandlers } from "@/features/intelligence/services/analysis-jobs";

let registered = false;

/**
 * Register every pipeline job handler (OCR_SUBMIT, OCR_POLL, OCR_FETCH,
 * ANALYZE). The tick route and the integration test call this once before
 * running the job runner. Idempotent so repeat calls are harmless.
 */
export function registerPipelineHandlers(): void {
  if (registered) return;
  registerOcrHandlers();
  registerAnalysisHandlers();
  registered = true;
}
