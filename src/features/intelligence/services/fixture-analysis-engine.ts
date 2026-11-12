import { mockUtilityBillAnalysis, type AnalysisResult } from "@/contracts";
import type {
  AnalysisEngine,
  AnalysisEngineInput,
  AnalysisEngineResult,
} from "@/features/intelligence/services/analysis-engine";

/**
 * Deterministic engine for the mock pipeline. Returns the utility-bill fixture
 * rewritten so the document ID (and every evidence document ID) is the real
 * document being analyzed, which is what the contract cross-reference check
 * requires. Ignores the OCR pages: it is a fixed fixture, not a real analysis.
 */
export class FixtureAnalysisEngine implements AnalysisEngine {
  async analyze(input: AnalysisEngineInput): Promise<AnalysisEngineResult> {
    const result: AnalysisResult = {
      ...mockUtilityBillAnalysis,
      document: {
        ...mockUtilityBillAnalysis.document,
        documentId: input.documentId,
      },
      evidence: mockUtilityBillAnalysis.evidence.map((e) => ({
        ...e,
        documentId: input.documentId,
      })),
    };

    return { result, outcome: "COMPLETED" };
  }
}
