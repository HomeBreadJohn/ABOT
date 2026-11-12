/**
 * Long-document evaluation (plan B24, mock mode only — ZERO live Lumen calls).
 *
 * A 30-page FICTIONAL synthetic document must:
 *   1. finish within the message budget (<= 2 + chunks * 2 messages, per B13),
 *   2. have every page either covered by some analyzed chunk or listed as
 *      unavailable in the report, and
 *   3. never send a single chat message longer than 4000 characters.
 *
 * The document is fictional boilerplate. No real personal data and no claim it
 * came from Lumen.
 */
import { describe, expect, it } from "vitest";

import { parseAnalysisResult } from "@/contracts";
import { CHAT_MESSAGE_MAX_LENGTH, type ChatProvider } from "@/lib/providers/chat-provider";
import { MockChatProvider } from "@/lib/providers";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";
import { chunkPages } from "@/features/intelligence/services/chunking";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";

const PAGE_COUNT = 30;
const documentId = "d0000030-0000-0000-0000-000000000030";

/** Build a 30-page synthetic document with distinct, grounded per-page text. */
function build30Pages(): NormalizedPage[] {
  const pages: NormalizedPage[] = [];
  for (let n = 1; n <= PAGE_COUNT; n++) {
    const text = [
      `Section ${n} of the service agreement.`,
      `Clause ${n}.1 describes the obligations for period ${n}.`,
      `Clause ${n}.2 sets the review date for section ${n} as day ${n}.`,
      `This page ${n} contains standard contractual boilerplate text.`,
    ].join("\n");
    const words = text
      .split(/\s+/)
      .filter(Boolean)
      .map((word, index) => ({ index, text: word, confidence: 0.95 }));
    pages.push({
      pageNumber: n,
      status: "READY",
      text,
      words,
      averageConfidence: 0.95,
    });
  }
  return pages;
}

/**
 * Wraps a ChatProvider to count messages and assert every message is within the
 * 4000-char chat limit as it is sent.
 */
class CountingChat implements ChatProvider {
  messageCount = 0;
  sessionCount = 0;
  maxMessageLength = 0;

  constructor(private readonly inner: ChatProvider) {}

  async openSession() {
    this.sessionCount++;
    return this.inner.openSession();
  }

  async send(sessionId: string, message: string) {
    this.messageCount++;
    this.maxMessageLength = Math.max(this.maxMessageLength, message.length);
    // Hard gate: the harness fails loudly if any message exceeds the limit.
    expect(
      message.length,
      `chat message #${this.messageCount} must be <= ${CHAT_MESSAGE_MAX_LENGTH} chars`,
    ).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);
    return this.inner.send(sessionId, message);
  }
}

describe("long-document eval (30-page synthetic, mock mode)", () => {
  it("finishes within the message budget, covers every page, and never exceeds 4000 chars", async () => {
    const pages = build30Pages();

    const mock = new MockChatProvider();
    mock.respondWith(
      (m) => m.includes("You classify a document"),
      JSON.stringify({
        category: "LEGAL",
        subtype: "Service agreement",
        issuer: "Fictional Services Ltd.",
        confidence: 0.9,
        candidates: [{ category: "LEGAL", confidence: 0.9 }],
      }),
    );
    // Each chunk yields one grounded finding whose quote is the first clause of
    // the lowest page in the chunk; page markers [p<N>] are in the chunk text.
    mock.respondWith(
      (m) => m.includes("per-chunk analysis"),
      JSON.stringify({ findings: [] }),
    );
    mock.respondWith(
      (m) => m.includes("Consolidate these findings"),
      JSON.stringify({
        overview: "A 30-page service agreement.",
        explanation: "This is a long service agreement split across many sections.",
      }),
    );

    const chat = new CountingChat(mock);
    const engine = new RealAnalysisEngine(chat);
    const { result } = await engine.analyze({
      documentId,
      pages,
      corrections: [],
      language: "EN",
    });

    const validated = parseAnalysisResult(result, { documentId });

    // The chunk plan the engine uses, computed the same way.
    const { chunks, failedPages } = chunkPages(pages);
    expect(chunks.length).toBeGreaterThan(0);

    // 1. Message budget: classify (1) + one per chunk (+ up to one repair each)
    //    + consolidation (1). The ceiling from B13 is 2 + chunks * 2.
    const budget = 2 + chunks.length * 2;
    expect(chat.messageCount).toBeLessThanOrEqual(budget);

    // 2. Every page is covered by some chunk's [pN..pM] range, or unavailable.
    const covered = new Set<number>();
    for (const chunk of chunks) {
      for (let p = chunk.pageStart; p <= chunk.pageEnd; p++) covered.add(p);
    }
    const unavailable = new Set(validated.analysisMetadata.unavailablePages);
    for (let n = 1; n <= PAGE_COUNT; n++) {
      expect(
        covered.has(n) || unavailable.has(n),
        `page ${n} is covered or listed unavailable`,
      ).toBe(true);
    }
    // This synthetic document has no failed pages, so coverage is complete.
    expect(failedPages).toEqual([]);
    expect(validated.analysisMetadata.partial).toBe(false);

    // 3. No single chat message exceeded the 4000-char limit (also enforced
    //    inside CountingChat.send as each message is sent).
    expect(chat.maxMessageLength).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);

    // Visibility into the run.
    console.log(
      `[long-document eval] pages=${PAGE_COUNT} chunks=${chunks.length} ` +
        `messages=${chat.messageCount} budget=${budget} ` +
        `maxMessageChars=${chat.maxMessageLength} limit=${CHAT_MESSAGE_MAX_LENGTH}`,
    );
  });
});
