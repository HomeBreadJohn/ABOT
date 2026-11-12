import { z } from "zod";

import {
  documentAnalysisSchema,
  extractedDataSchema,
  type DocumentAnalysis,
} from "@/lib/ai/schemas/document-analysis";

export type AnalyzeDocumentInput = {
  documentId: string;
  content: string;
  mimeType: string;
};

export type ClassifyDocumentInput = {
  documentId: string;
  content: string;
  mimeType: string;
};

export type ExplainDocumentInput = {
  documentId: string;
  extractedData: unknown;
};

export type DocumentClassification = {
  documentType: string;
  confidence: number | null;
};

export interface AiProvider {
  analyzeDocument(input: AnalyzeDocumentInput): Promise<DocumentAnalysis>;
  classifyDocument(
    input: ClassifyDocumentInput,
  ): Promise<DocumentClassification>;
  extractInformation(
    input: AnalyzeDocumentInput,
  ): Promise<DocumentAnalysis["extractedData"]>;
  explainDocument(input: ExplainDocumentInput): Promise<string>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly code:
      "NOT_CONFIGURED" | "REQUEST_FAILED" | "INVALID_OUTPUT",
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "AiProviderError";
  }
}

const documentClassificationSchema = z.object({
  documentType: z.string().min(1),
  confidence: z.number().min(0).max(1).nullable(),
});

export function parseDocumentClassification(
  value: unknown,
): DocumentClassification {
  const result = documentClassificationSchema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      "The AI provider returned an invalid classification.",
      "INVALID_OUTPUT",
      { cause: z.treeifyError(result.error) },
    );
  }
  return result.data;
}

export function parseExtractedData(value: unknown) {
  const result = extractedDataSchema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      "The AI provider returned invalid extracted data.",
      "INVALID_OUTPUT",
      { cause: z.treeifyError(result.error) },
    );
  }
  return result.data;
}

export function parseExplanation(value: unknown) {
  const result = z.string().min(1).safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      "The AI provider returned an invalid explanation.",
      "INVALID_OUTPUT",
      { cause: z.treeifyError(result.error) },
    );
  }
  return result.data;
}

export function parseDocumentAnalysis(value: unknown): DocumentAnalysis {
  const result = documentAnalysisSchema.safeParse(value);
  if (!result.success) {
    throw new AiProviderError(
      "The AI provider returned an invalid analysis.",
      "INVALID_OUTPUT",
      {
        cause: z.treeifyError(result.error),
      },
    );
  }
  return result.data;
}
