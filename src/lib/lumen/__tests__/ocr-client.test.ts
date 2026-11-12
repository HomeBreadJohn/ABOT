import { afterEach, describe, expect, it } from "vitest";

import documentFixture from "@/lib/lumen/__fixtures__/ocr/document.json";
import pagesFixture from "@/lib/lumen/__fixtures__/ocr/pages.json";
import { LumenOcrProvider } from "@/lib/lumen/ocr-client";

const LUMEN_ENV = {
  PROVIDER_MODE: "lumen",
  LUMEN_API_KEY: "key-123",
  LUMEN_API_SECRET: "secret-456",
  LUMEN_OCR_BASE_URL: "https://ocr.example.test/ocr",
  LUMEN_AI_CHAT_BASE_URL: "https://chat.example.test/ai_chat",
};

function withLumenEnv() {
  Object.assign(process.env, LUMEN_ENV);
}

type RecordedCall = { url: string; method: string; init: RequestInit };

/** A fake transport that records every call and returns a queued response. */
function recordingTransport(
  routes: (call: RecordedCall) => Response,
): { transport: (url: string, init: RequestInit) => Promise<Response>; calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const transport = async (url: string, init: RequestInit) => {
    const call = { url, method: String(init.method), init };
    calls.push(call);
    return routes(call);
  };
  return { transport, calls };
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("LumenOcrProvider", () => {
  afterEach(() => {
    for (const key of Object.keys(LUMEN_ENV)) delete process.env[key];
  });

  it("submit sends raw bytes, both auth headers and the document name header", async () => {
    withLumenEnv();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const { transport, calls } = recordingTransport(() =>
      json({ data: { DocumentID: "doc-42" }, requestId: "r" }, 202),
    );

    const provider = new LumenOcrProvider(transport);
    const result = await provider.submit({
      bytes,
      mimeType: "application/pdf",
      filename: "my file.pdf",
    });

    expect(result).toEqual({ providerDocumentId: "doc-42" });
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe("https://ocr.example.test/ocr/documents");
    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("lumen-api-key")).toBe("key-123");
    expect(headers.get("lumen-api-secret")).toBe("secret-456");
    expect(headers.get("content-type")).toBe("application/pdf");
    expect(headers.get("x-lumen-document-name")).toBe("my%20file.pdf");
    expect(calls[0].init.body).toBe(bytes);
  });

  it("getStatus maps the document record Status", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport(() => json(documentFixture));

    const provider = new LumenOcrProvider(transport);
    const status = await provider.getStatus("doc-42");

    expect(status).toEqual({ status: "READY" });
    expect(calls[0].url).toBe("https://ocr.example.test/ocr/documents/doc-42");
    expect(calls[0].method).toBe("GET");
  });

  it("getPages returns normalized pages with IncludeWords", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport((call) =>
      call.url.endsWith("/pages?IncludeWords=true")
        ? json(pagesFixture)
        : json(documentFixture),
    );

    const provider = new LumenOcrProvider(transport);
    const pages = await provider.getPages("doc-42");

    expect(pages).toHaveLength(2);
    expect(pages[0].pageNumber).toBe(1);
    expect(pages[0].words[0].text).toBe("SAMPLE");
    expect(pages[0].averageConfidence).toBeNull();
    const pagesCall = calls.find((c) =>
      c.url.endsWith("/pages?IncludeWords=true"),
    );
    expect(pagesCall?.url).toBe(
      "https://ocr.example.test/ocr/documents/doc-42/pages?IncludeWords=true",
    );
  });

  it("getPages marks a PARTIAL doc's failed pages FAILED", async () => {
    withLumenEnv();
    const partialDoc = {
      data: { ...documentFixture.data, Status: "PARTIAL", FailedPageNumbers: [2] },
      requestId: "r",
    };
    const { transport } = recordingTransport((call) =>
      call.url.endsWith("/pages?IncludeWords=true")
        ? json(pagesFixture)
        : json(partialDoc),
    );

    const provider = new LumenOcrProvider(transport);
    const pages = await provider.getPages("doc-42");

    expect(pages[0].status).toBe("READY");
    expect(pages[1].status).toBe("FAILED");
    expect(pages[1].text).toBe("");
  });

  it("retry POSTs the retry path once", async () => {
    withLumenEnv();
    const { transport, calls } = recordingTransport(() =>
      json({ data: documentFixture.data, requestId: "r" }, 202),
    );

    const provider = new LumenOcrProvider(transport);
    await provider.retry("doc-42");

    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].url).toBe(
      "https://ocr.example.test/ocr/documents/doc-42/retry",
    );
  });
});
