import type { NormalizedPage, OcrProvider } from "@/lib/providers/ocr-provider";
import {
  partialUtilityBillPages,
  utilityBillPages,
} from "@/lib/providers/mock/fixtures/utility-bill-pages";

/**
 * Deterministic OCR provider for tests and mock mode. The first getStatus call
 * for a document reports PROCESSING, the second reports READY (or PARTIAL when
 * configured). Status calls are counted per providerDocumentId.
 */
export class MockOcrProvider implements OcrProvider {
  private readonly partial: boolean;
  private readonly statusCalls = new Map<string, number>();

  constructor(options: { partial?: boolean } = {}) {
    this.partial = options.partial ?? false;
  }

  async submit(
    input: Parameters<OcrProvider["submit"]>[0],
  ): Promise<{ providerDocumentId: string }> {
    return { providerDocumentId: `mock-ocr:${input.filename}` };
  }

  async getStatus(providerDocumentId: string): Promise<{
    status: "PENDING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";
  }> {
    const calls = (this.statusCalls.get(providerDocumentId) ?? 0) + 1;
    this.statusCalls.set(providerDocumentId, calls);
    if (calls < 2) return { status: "PROCESSING" };
    return { status: this.partial ? "PARTIAL" : "READY" };
  }

  async getPages(): Promise<NormalizedPage[]> {
    return this.partial ? partialUtilityBillPages : utilityBillPages;
  }

  async retry(providerDocumentId: string): Promise<void> {
    this.statusCalls.delete(providerDocumentId);
  }
}
