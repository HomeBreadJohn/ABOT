import type { AllowedMimeType } from "@/contracts";

export type NormalizedPage = {
  pageNumber: number;
  status: "READY" | "FAILED";
  text: string;
  words: { index: number; text: string; confidence: number | null }[];
  averageConfidence: number | null;
};

export interface OcrProvider {
  submit(input: {
    bytes: Uint8Array;
    mimeType: AllowedMimeType;
    filename: string;
  }): Promise<{ providerDocumentId: string }>;
  getStatus(providerDocumentId: string): Promise<{
    status: "PENDING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";
  }>;
  getPages(providerDocumentId: string): Promise<NormalizedPage[]>;
  retry(providerDocumentId: string): Promise<void>;
}
