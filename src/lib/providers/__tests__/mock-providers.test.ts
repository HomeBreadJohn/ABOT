import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getOcrProvider, getChatProvider } from "@/lib/providers";
import type { OcrProvider } from "@/lib/providers/ocr-provider";
import { MockOcrProvider } from "@/lib/providers/mock/mock-ocr-provider";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { LumenOcrProvider } from "@/lib/lumen/ocr-client";
import {
  utilityBillPages,
  partialUtilityBillPages,
} from "@/lib/providers/mock/fixtures/utility-bill-pages";

// Page-1 and page-2 evidence excerpts that appear in mockUtilityBillAnalysis.
// The mock OCR text must contain them so downstream evidence mapping can match.
const EVIDENCE_EXCERPTS = [
  "Amount Due: PHP 2,450.00",
  "Due Date: December 15, 2026",
  "Consumption: 250 kWh",
  "A surcharge applies to payments after the due date.",
];

describe("MockOcrProvider", () => {
  it("submits and returns a provider document id", async () => {
    const provider = new MockOcrProvider();
    const { providerDocumentId } = await provider.submit({
      bytes: new Uint8Array([1, 2, 3]),
      mimeType: "application/pdf",
      filename: "bill.pdf",
    });
    expect(typeof providerDocumentId).toBe("string");
    expect(providerDocumentId.length).toBeGreaterThan(0);
  });

  it("returns PROCESSING on the first status call then READY on the second", async () => {
    const provider = new MockOcrProvider();
    const { providerDocumentId } = await provider.submit({
      bytes: new Uint8Array([1]),
      mimeType: "application/pdf",
      filename: "bill.pdf",
    });
    expect((await provider.getStatus(providerDocumentId)).status).toBe(
      "PROCESSING",
    );
    expect((await provider.getStatus(providerDocumentId)).status).toBe("READY");
  });

  it("getPages returns pages whose text contains the fixture evidence excerpts", async () => {
    const provider: OcrProvider = new MockOcrProvider();
    const { providerDocumentId } = await provider.submit({
      bytes: new Uint8Array([1]),
      mimeType: "application/pdf",
      filename: "bill.pdf",
    });
    const pages = await provider.getPages(providerDocumentId);
    const allText = pages.map((p) => p.text).join("\n");
    for (const excerpt of EVIDENCE_EXCERPTS) {
      expect(allText).toContain(excerpt);
    }
  });

  it("PARTIAL variant reports status PARTIAL and page 2 FAILED", async () => {
    const provider: OcrProvider = new MockOcrProvider({ partial: true });
    const { providerDocumentId } = await provider.submit({
      bytes: new Uint8Array([1]),
      mimeType: "application/pdf",
      filename: "bill.pdf",
    });
    await provider.getStatus(providerDocumentId); // PROCESSING
    expect((await provider.getStatus(providerDocumentId)).status).toBe(
      "PARTIAL",
    );
    const pages = await provider.getPages(providerDocumentId);
    const page2 = pages.find((p) => p.pageNumber === 2);
    expect(page2?.status).toBe("FAILED");
  });
});

describe("utility-bill fixtures", () => {
  it("default fixture has both pages READY", () => {
    expect(utilityBillPages.every((p) => p.status === "READY")).toBe(true);
  });

  it("partial fixture has page 2 FAILED", () => {
    const page2 = partialUtilityBillPages.find((p) => p.pageNumber === 2);
    expect(page2?.status).toBe("FAILED");
  });
});

describe("MockChatProvider", () => {
  it("opens a session with ids", async () => {
    const chat = new MockChatProvider();
    const session = await chat.openSession();
    expect(typeof session.sessionId).toBe("string");
    expect(typeof session.instanceId).toBe("string");
  });

  it("returns a queued reply matched by predicate", async () => {
    const chat = new MockChatProvider();
    chat.respondWith((m) => m.includes("hello"), "hi there");
    const { sessionId } = await chat.openSession();
    expect((await chat.send(sessionId, "say hello")).reply).toBe("hi there");
  });

  it("throws when a message exceeds 4000 characters", async () => {
    const chat = new MockChatProvider();
    const { sessionId } = await chat.openSession();
    await expect(chat.send(sessionId, "x".repeat(4001))).rejects.toThrow();
  });
});

describe("provider selection", () => {
  const original = process.env.PROVIDER_MODE;

  beforeEach(() => {
    delete process.env.PROVIDER_MODE;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.PROVIDER_MODE;
    else process.env.PROVIDER_MODE = original;
  });

  it("getOcrProvider returns the mock when PROVIDER_MODE is unset", () => {
    expect(getOcrProvider()).toBeInstanceOf(MockOcrProvider);
  });

  it("getChatProvider returns the mock when PROVIDER_MODE is unset", () => {
    expect(getChatProvider()).toBeInstanceOf(MockChatProvider);
  });

  it("returns the Lumen OCR provider in lumen mode; chat is still not implemented", () => {
    process.env.PROVIDER_MODE = "lumen";
    process.env.LUMEN_API_KEY = "k";
    process.env.LUMEN_API_SECRET = "s";
    process.env.LUMEN_OCR_BASE_URL = "https://example.test/ocr";
    process.env.LUMEN_AI_CHAT_BASE_URL = "https://example.test/ai_chat";
    // B9 wires lumen OCR; B12 still handles the chat provider.
    expect(getOcrProvider()).toBeInstanceOf(LumenOcrProvider);
    expect(() => getChatProvider()).toThrow(/not implemented/i);
  });
});
