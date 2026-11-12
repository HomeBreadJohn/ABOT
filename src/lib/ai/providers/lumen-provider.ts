import "server-only";

import { getLumenEnv } from "@/lib/env/server";
import type { DocumentAnalysis } from "@/lib/ai/schemas/document-analysis";
import {
  AiProviderError,
  type AiProvider,
  type AnalyzeDocumentInput,
  type ClassifyDocumentInput,
  type DocumentClassification,
  type ExplainDocumentInput,
} from "@/lib/ai/providers/ai-provider";

export class LumenProvider implements AiProvider {
  private readonly configuration = getLumenEnv();

  async analyzeDocument(
    input: AnalyzeDocumentInput,
  ): Promise<DocumentAnalysis> {
    void input;
    this.assertConfigured();
    throw new AiProviderError(
      "Lumen AI integration is pending its official API contract. No request was sent.",
      "REQUEST_FAILED",
    );
  }

  async classifyDocument(
    input: ClassifyDocumentInput,
  ): Promise<DocumentClassification> {
    void input;
    this.assertConfigured();
    throw new AiProviderError(
      "Lumen AI classification is pending its official API contract. No request was sent.",
      "REQUEST_FAILED",
    );
  }

  async extractInformation(
    input: AnalyzeDocumentInput,
  ): Promise<DocumentAnalysis["extractedData"]> {
    void input;
    this.assertConfigured();
    throw new AiProviderError(
      "Lumen AI extraction is pending its official API contract. No request was sent.",
      "REQUEST_FAILED",
    );
  }

  async explainDocument(input: ExplainDocumentInput): Promise<string> {
    void input;
    this.assertConfigured();
    throw new AiProviderError(
      "Lumen AI explanation is pending its official API contract. No request was sent.",
      "REQUEST_FAILED",
    );
  }

  private assertConfigured() {
    if (
      !this.configuration.LUMEN_API_KEY ||
      !this.configuration.LUMEN_API_BASE_URL ||
      !this.configuration.LUMEN_MODEL
    ) {
      throw new AiProviderError(
        "Lumen AI is not configured. Provide the optional Lumen variables after the official API documentation is available.",
        "NOT_CONFIGURED",
      );
    }
  }
}

// TODO: Implement authenticated HTTP calls only after the official Lumen API documentation is provided.
// Do not infer endpoints, request shapes, response shapes, or model capabilities.
export function createLumenProvider(): LumenProvider {
  return new LumenProvider();
}
