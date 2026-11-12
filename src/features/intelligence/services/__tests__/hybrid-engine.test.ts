import { describe, expect, it } from "vitest";

import { parseAnalysisResult } from "@/contracts";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { HybridAnalysisEngine } from "@/features/intelligence/services/hybrid-engine";
import { PROMPT_VERSION } from "@/features/intelligence/prompts/system-rules";

/** A long READY page so chunking produces several chunks at the default size. */
function page(pageNumber: number, text: string): NormalizedPage {
  return {
    pageNumber,
    status: "READY",
    text,
    words: text.split(/\s+/).map((t, index) => ({
      index,
      text: t,
      confidence: 0.9,
    })),
    averageConfidence: 0.9,
  };
}

/** Pages sized so chunkPages yields multiple chunks (default maxChars 2400). */
function multiChunkPages(): NormalizedPage[] {
  // Each page ~2000 chars of distinct paragraphs, forcing one chunk per page.
  const makeText = (n: number) =>
    Array.from({ length: 8 }, (_, i) => `Page ${n} paragraph ${i}. ${"x".repeat(200)}`).join("\n\n");
  return [page(1, makeText(1)), page(2, makeText(2)), page(3, makeText(3))];
}

/** A classify reply the classify service accepts. */
const CLASSIFY_REPLY = JSON.stringify({
  category: "UTILITIES",
  subtype: "Electric bill",
  issuer: "Sample Electric Cooperative",
  confidence: 0.95,
  candidates: [{ category: "UTILITIES", confidence: 0.95 }],
});

function chunkReply(findings: unknown[]): string {
  return JSON.stringify({ findings });
}

const ONE_FINDING = [
  {
    type: "KEY_INFORMATION",
    title: "Amount due",
    explanation: "The bill states an amount is due.",
    informationStatus: "FOUND",
    confidence: 0.8,
    basis: "Stated in the billing summary.",
    quote: "Amount Due PHP 2,450.00",
    page: 1,
  },
];

const CONSOLIDATION_REPLY = JSON.stringify({
  overview: "This is an electric bill.",
  explanation: "Plain-language summary of the bill.",
});

/**
 * Build an engine whose chat answers classify, every chunk, and consolidation.
 * Returns the engine, the chat, and the captured messages for assertions.
 */
function makeEngine() {
  const chat = new MockChatProvider();
  const messages: string[] = [];
  const originalSend = chat.send.bind(chat);
  chat.send = async (sessionId: string, message: string) => {
    messages.push(message);
    return originalSend(sessionId, message);
  };

  chat.respondWith((m) => m.includes("classify a document"), CLASSIFY_REPLY);
  chat.respondWith((m) => m.includes("Consolidate"), CONSOLIDATION_REPLY);
  chat.respondWith((m) => m.includes("per-chunk"), chunkReply(ONE_FINDING));

  const engine = new HybridAnalysisEngine(chat);
  return { engine, chat, messages };
}

describe("HybridAnalysisEngine", () => {
  it("sends classify first, one message per chunk, then one consolidation", async () => {
    const { engine, messages } = makeEngine();
    const pages = multiChunkPages();

    await engine.analyze({
      documentId: "doc-1",
      pages,
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    const chunkMessages = messages.filter((m) => m.includes("per-chunk"));
    const consolidation = messages.filter((m) => m.includes("Consolidate"));
    const classify = messages.filter((m) => m.includes("classify a document"));

    expect(classify).toHaveLength(1);
    expect(chunkMessages.length).toBeGreaterThanOrEqual(3);
    expect(consolidation).toHaveLength(1);

    // classify first, consolidation last.
    expect(messages[0]).toContain("classify a document");
    expect(messages[messages.length - 1]).toContain("Consolidate");

    // Total messages <= 2 + chunks*2 (chunk count = number of READY chunks).
    const chunkCount = chunkMessages.length;
    expect(messages.length).toBeLessThanOrEqual(2 + chunkCount * 2);
  });

  it("includes the section-8 safety rules in every chunk and consolidation prompt", async () => {
    const { engine, messages } = makeEngine();

    await engine.analyze({
      documentId: "doc-1",
      pages: multiChunkPages(),
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    const prompts = messages.filter(
      (m) => m.includes("per-chunk") || m.includes("Consolidate"),
    );
    expect(prompts.length).toBeGreaterThan(0);
    for (const prompt of prompts) {
      expect(prompt).toContain("Never invent");
      expect(prompt.toLowerCase()).toContain("facts from");
      expect(prompt.toLowerCase()).toContain("fraudulent");
      expect(prompt).toMatch(/never (claim|take).*action/i);
      expect(prompt.toLowerCase()).toContain("quote the exact");
    }
  });

  it("every prompt fits within the 4000-char chat limit", async () => {
    const { engine, messages } = makeEngine();
    await engine.analyze({
      documentId: "doc-1",
      pages: multiChunkPages(),
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });
    for (const m of messages) {
      expect(m.length).toBeLessThanOrEqual(4000);
    }
  });

  it("sends compact merged findings to consolidation, never raw page text", async () => {
    const marker = "UNIQUERAWPAGETEXTMARKER";
    const chat = new MockChatProvider();
    const messages: string[] = [];
    const originalSend = chat.send.bind(chat);
    chat.send = async (s: string, message: string) => {
      messages.push(message);
      return originalSend(s, message);
    };
    chat.respondWith((m) => m.includes("classify a document"), CLASSIFY_REPLY);
    chat.respondWith((m) => m.includes("Consolidate"), CONSOLIDATION_REPLY);
    chat.respondWith((m) => m.includes("per-chunk"), chunkReply(ONE_FINDING));

    const engine = new HybridAnalysisEngine(chat);
    const pages = [page(1, `Lots of text ${marker} on the page.`)];

    await engine.analyze({
      documentId: "doc-1",
      pages,
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    const consolidation = messages.find((m) => m.includes("Consolidate"));
    expect(consolidation).toBeDefined();
    expect(consolidation).not.toContain(marker);
    // but it does carry the compact finding titles/statuses/pages
    expect(consolidation).toContain("Amount due");
    expect(consolidation).toContain("FOUND");
  });

  it("merges duplicate findings (same type + normalized title) and combines quotes", async () => {
    const chat = new MockChatProvider();
    chat.respondWith((m) => m.includes("classify a document"), CLASSIFY_REPLY);
    chat.respondWith((m) => m.includes("Consolidate"), CONSOLIDATION_REPLY);

    let chunkCall = 0;
    const originalSend = chat.send.bind(chat);
    chat.send = async (s: string, message: string) => {
      if (message.includes("per-chunk")) {
        chunkCall += 1;
        const finding = {
          type: "KEY_INFORMATION",
          title: chunkCall === 1 ? "Amount Due" : "amount due", // normalizes equal
          explanation: "The amount is due.",
          informationStatus: "FOUND",
          confidence: 0.8,
          basis: "Billing summary.",
          quote: `quote-from-chunk-${chunkCall}`,
          page: chunkCall,
        };
        return { reply: chunkReply([finding]) };
      }
      return originalSend(s, message);
    };

    const engine = new HybridAnalysisEngine(chat);
    const { result, quotesByFinding } = await engine.analyzeWithQuotes({
      documentId: "doc-1",
      pages: multiChunkPages(),
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    // All merged into a single key-information finding.
    expect(result.keyInformation).toHaveLength(1);
    // basis holds only the real basis text — no quote suffix.
    expect(result.keyInformation[0].basis).toBe("Billing summary.");
    // The combined quotes ride on the structured channel, each on its own page.
    const quotes = quotesByFinding.get(result.keyInformation[0].id);
    expect(quotes).toEqual([
      { quote: "quote-from-chunk-1", page: 1 },
      { quote: "quote-from-chunk-2", page: 2 },
      { quote: "quote-from-chunk-3", page: 3 },
    ]);
  });

  it("produces a valid draft AnalysisResult with the module and input metadata", async () => {
    const { engine } = makeEngine();
    const { result, outcome } = await engine.analyze({
      documentId: "doc-xyz",
      pages: multiChunkPages(),
      corrections: [],
      language: "FIL",
      category: "UTILITIES",
    });

    expect(outcome).toBe("COMPLETED");
    expect(result.document.documentId).toBe("doc-xyz");
    expect(result.analysisMetadata.language).toBe("FIL");
    expect(result.analysisMetadata.analysisVersion).toBe(1);
    expect(result.analysisMetadata.categoryModules).toEqual([
      "utilities.billing",
      "utilities.consumption",
    ]);
    // Draft has no evidence yet (mapping is B14/B16).
    expect(result.evidence).toEqual([]);
    // A valid skeleton the contract accepts.
    expect(() =>
      parseAnalysisResult(result, { documentId: "doc-xyz" }),
    ).not.toThrow();
  });

  it("throws when more than half the chunks fail", async () => {
    const chat = new MockChatProvider();
    chat.respondWith((m) => m.includes("classify a document"), CLASSIFY_REPLY);
    chat.respondWith((m) => m.includes("Consolidate"), CONSOLIDATION_REPLY);
    // Every chunk returns garbage; requestJson fails for all of them.
    chat.respondWith((m) => m.includes("per-chunk"), "not json at all");

    const engine = new HybridAnalysisEngine(chat);
    await expect(
      engine.analyze({
        documentId: "doc-1",
        pages: multiChunkPages(),
        corrections: [],
        language: "EN",
        category: "UTILITIES",
      }),
    ).rejects.toThrow();
  });

  it("marks partial and names affected pages when some (<= half) chunks fail", async () => {
    const chat = new MockChatProvider();
    chat.respondWith((m) => m.includes("classify a document"), CLASSIFY_REPLY);
    chat.respondWith((m) => m.includes("Consolidate"), CONSOLIDATION_REPLY);

    let chunkCall = 0;
    const originalSend = chat.send.bind(chat);
    chat.send = async (s: string, message: string) => {
      if (message.includes("per-chunk")) {
        chunkCall += 1;
        // Fail only the first of three chunks (<= half).
        if (chunkCall === 1) return { reply: "not json" };
        return { reply: chunkReply(ONE_FINDING) };
      }
      return originalSend(s, message);
    };

    const engine = new HybridAnalysisEngine(chat);
    const { result } = await engine.analyze({
      documentId: "doc-1",
      pages: multiChunkPages(),
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    expect(result.analysisMetadata.partial).toBe(true);
    expect(result.analysisMetadata.unavailablePages).toContain(1);
    expect(result.limitations.join(" ")).toContain("1");
  });

  it("marks partial and lists OCR-FAILED pages as unavailable", async () => {
    const { engine } = makeEngine();
    const pages: NormalizedPage[] = [
      page(1, "Readable page one text."),
      {
        pageNumber: 2,
        status: "FAILED",
        text: "",
        words: [],
        averageConfidence: null,
      },
    ];

    const { result } = await engine.analyze({
      documentId: "doc-1",
      pages,
      corrections: [],
      language: "EN",
      category: "UTILITIES",
    });

    expect(result.analysisMetadata.partial).toBe(true);
    expect(result.analysisMetadata.unavailablePages).toContain(2);
  });

  it("caches chunk output: a rerun with unchanged chunks sends no chunk messages", async () => {
    const { engine, messages } = makeEngine();
    const pages = multiChunkPages();
    const input = {
      documentId: "doc-1",
      pages,
      corrections: [],
      language: "EN" as const,
      category: "UTILITIES" as const,
    };

    await engine.analyze(input);
    const firstChunkMessages = messages.filter((m) => m.includes("per-chunk")).length;
    expect(firstChunkMessages).toBeGreaterThan(0);

    const before = messages.length;
    await engine.analyze(input);
    const secondRunMessages = messages.slice(before);
    const secondChunkMessages = secondRunMessages.filter((m) =>
      m.includes("per-chunk"),
    );
    expect(secondChunkMessages).toHaveLength(0);
  });

  it("exposes PROMPT_VERSION", () => {
    expect(PROMPT_VERSION).toBe("1");
  });
});
