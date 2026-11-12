import "server-only";

import type { AllowedMimeType } from "@/contracts";
import type { NormalizedPage, OcrProvider } from "@/lib/providers/ocr-provider";
import { normalizePages } from "@/features/ocr/services/normalize-pages";
import {
  lumenRequest,
  type LumenTransport,
} from "@/lib/lumen/http";
import {
  ocrDocumentSchema,
  ocrPagesSchema,
  ocrUploadResponseSchema,
} from "@/lib/lumen/ocr-schemas";

/**
 * OcrProvider backed by the Lumen OCR API. The transport is injected so unit
 * tests run against fakes with zero network calls.
 */
export class LumenOcrProvider implements OcrProvider {
  constructor(private readonly transport?: LumenTransport) {}

  async submit(input: {
    bytes: Uint8Array;
    mimeType: AllowedMimeType;
    filename: string;
  }): Promise<{ providerDocumentId: string }> {
    const result = await lumenRequest({
      base: "ocr",
      path: "/documents",
      method: "POST",
      bodyBytes: input.bytes,
      contentType: input.mimeType,
      extraHeaders: {
        "x-lumen-document-name": encodeURIComponent(input.filename),
      },
      schema: ocrUploadResponseSchema,
      operation: "ocr_upload",
      transport: this.transport,
    });
    return { providerDocumentId: result.DocumentID };
  }

  async getStatus(providerDocumentId: string): Promise<{
    status: "PENDING" | "PROCESSING" | "READY" | "PARTIAL" | "FAILED";
  }> {
    const doc = await this.getDocument(providerDocumentId);
    return { status: doc.Status };
  }

  async getPages(providerDocumentId: string): Promise<NormalizedPage[]> {
    // The failed-page set lives on the document record, not the pages list.
    const doc = await this.getDocument(providerDocumentId);
    const pages = await lumenRequest({
      base: "ocr",
      path: `/documents/${providerDocumentId}/pages?IncludeWords=true`,
      method: "GET",
      schema: ocrPagesSchema,
      operation: "ocr_get_pages",
      transport: this.transport,
    });
    return normalizePages(pages, doc.FailedPageNumbers);
  }

  async retry(providerDocumentId: string): Promise<void> {
    await lumenRequest({
      base: "ocr",
      path: `/documents/${providerDocumentId}/retry`,
      method: "POST",
      schema: ocrDocumentSchema,
      operation: "ocr_retry",
      transport: this.transport,
    });
  }

  private getDocument(providerDocumentId: string) {
    return lumenRequest({
      base: "ocr",
      path: `/documents/${providerDocumentId}`,
      method: "GET",
      schema: ocrDocumentSchema,
      operation: "ocr_get_document",
      transport: this.transport,
    });
  }
}
