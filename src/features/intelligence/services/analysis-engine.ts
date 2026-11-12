import type {
  AnalysisResult,
  DocumentCategory,
  ExplanationLanguage,
} from "@/contracts";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";

/**
 * A user correction to OCR text. Corrections are stored separately from the
 * original OCR and are fed to the engine on reanalysis. The full type lives in
 * the corrections task; the engine only needs the page and the two values.
 */
export type OcrCorrection = {
  pageNumber: number;
  originalValue: string;
  correctedValue: string;
};

export type AnalysisEngineInput = {
  documentId: string;
  pages: NormalizedPage[];
  corrections: OcrCorrection[];
  language: ExplanationLanguage;
  category?: DocumentCategory;
};

export type AnalysisEngineResult = {
  result: AnalysisResult;
  outcome: "COMPLETED" | "REVIEW_REQUIRED" | "NEEDS_CORRECTION";
};

/**
 * Turns OCR pages into a validated AnalysisResult. The fixture engine backs the
 * mock pipeline; the hybrid Lumen engine (Task B16) replaces it later.
 */
export interface AnalysisEngine {
  analyze(input: AnalysisEngineInput): Promise<AnalysisEngineResult>;
}
