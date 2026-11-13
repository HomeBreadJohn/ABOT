/**
 * Cost evaluation (plan B24, mock mode only — ZERO live Lumen calls).
 *
 * Credits per document, summed from the CREDIT_COST model the way the real
 * provider_calls accounting charges them, must stay at or under the budget:
 *
 *     6 + polls + 2 + 5 * (2 + 2 * chunks)
 *
 * where:
 *   - 6                  : OCR upload (CREDIT_COST.ocr_upload)
 *   - polls              : one OCR status GET per poll (CREDIT_COST.ocr_get_document)
 *   - 2                  : OCR document GET + pages GET on completion
 *   - 5 * (2 + 2*chunks) : AI messages at 5 credits, generous ceiling that
 *                          allows one repair per chunk plus classify/consolidate
 *
 * The AI side is measured from the real engine run against MockChatProvider by
 * counting openSession (2 credits) and send (5 credits) calls, then mapped
 * through CREDIT_COST exactly as the Lumen client would charge them. The OCR
 * side is modeled from the MockOcrProvider's call pattern. The actual figures
 * are logged.
 */
import { describe, expect, it } from "vitest";

import { parseAnalysisResult } from "@/contracts";
import { CREDIT_COST } from "@/lib/lumen/credits";
import { type ChatProvider } from "@/lib/providers/chat-provider";
import { MockChatProvider, MockOcrProvider } from "@/lib/providers";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";
import { chunkPages } from "@/features/intelligence/services/chunking";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";

/** Counts the billable chat operations an analysis run performs. */
class CountingChat implements ChatProvider {
  sessionCount = 0;
  messageCount = 0;

  constructor(private readonly inner: ChatProvider) {}

  async openSession() {
    this.sessionCount++;
    return this.inner.openSession();
  }

  async send(sessionId: string, message: string) {
    this.messageCount++;
    return this.inner.send(sessionId, message);
  }
}

function toPage(pageNumber: number, text: string): NormalizedPage {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ index, text: word, confidence: 0.95 }));
  return { pageNumber, status: "READY", text, words, averageConfidence: 0.95 };
}

/** A compact two-page fictional utility bill with grounded findings. */
function twoPageBill() {
  const pages = [
    toPage(
      1,
      [
        "Sample Electric Cooperative",
        "Amount Due: PHP 2,450.00",
        "Due Date: December 15, 2026",
      ].join("\n"),
    ),
    toPage(2, "A surcharge applies to payments after the due date."),
  ];
  const chat = new MockChatProvider();
  chat.respondWith(
    (m) => m.includes("Classify a document"),
    JSON.stringify({
      category: "UTILITIES",
      subtype: "Electricity bill",
      issuer: "Sample Electric Cooperative",
      confidence: 0.95,
      candidates: [{ category: "UTILITIES", confidence: 0.95 }],
    }),
  );
  chat.respondWith(
    (m) => m.includes("per-chunk analysis"),
    JSON.stringify({
      findings: [
        {
          type: "KEY_INFORMATION",
          title: "Amount due",
          explanation: "The bill states the amount due.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Billing summary line.",
          quote: "Amount Due: PHP 2,450.00",
          page: 1,
        },
      ],
    }),
  );
  chat.respondWith(
    (m) => m.includes("Consolidate these findings"),
    JSON.stringify({
      overview: "A monthly electricity bill.",
      explanation: "This is your electricity bill with the amount due and due date.",
    }),
  );
  return { pages, chat };
}

/**
 * Drive the OCR mock the way the pipeline does: poll until READY, then fetch
 * pages. Returns the number of status polls and the GETs performed so the OCR
 * credits can be charged from CREDIT_COST.
 */
async function runMockOcr(): Promise<{ polls: number; pageGets: number }> {
  const provider = new MockOcrProvider();
  const { providerDocumentId } = await provider.submit({
    bytes: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
    mimeType: "application/pdf",
    filename: "bill.pdf",
  });

  let polls = 0;
  // The mock reports PROCESSING then READY; poll until terminal.
  for (let i = 0; i < 40; i++) {
    polls++;
    const { status } = await provider.getStatus(providerDocumentId);
    if (status === "READY" || status === "PARTIAL" || status === "FAILED") break;
  }
  await provider.getPages();
  return { polls, pageGets: 1 };
}

describe("cost eval (mock mode, credits per document within budget)", () => {
  it("charges at most 6 + polls + 2 + 5 * (2 + 2 * chunks) credits per document", async () => {
    const documentId = "c0000001-0000-0000-0000-000000000001";
    const { pages, chat: mock } = twoPageBill();

    // OCR side (modeled from the mock provider's call pattern).
    const { polls, pageGets } = await runMockOcr();

    // AI side (measured from the real engine against the mock chat).
    const chat = new CountingChat(mock);
    const engine = new RealAnalysisEngine(chat);
    const { result } = await engine.analyze({
      documentId,
      pages,
      corrections: [],
      language: "EN",
    });
    parseAnalysisResult(result, { documentId }); // report is valid

    const { chunks } = chunkPages(pages);

    // Actual credits, summed exactly as the Lumen client charges them.
    const ocrCredits =
      CREDIT_COST.ocr_upload +
      polls * CREDIT_COST.ocr_get_document +
      CREDIT_COST.ocr_get_document + // completion document GET
      pageGets * CREDIT_COST.ocr_get_pages;
    const aiCredits =
      chat.sessionCount * CREDIT_COST.ai_session +
      chat.messageCount * CREDIT_COST.ai_message;
    const actual = ocrCredits + aiCredits;

    // Budget from the plan.
    const budget =
      CREDIT_COST.ocr_upload +
      polls +
      2 +
      CREDIT_COST.ai_message * (2 + 2 * chunks.length);

    console.log(
      `[cost eval] polls=${polls} chunks=${chunks.length} ` +
        `sessions=${chat.sessionCount} messages=${chat.messageCount} | ` +
        `ocrCredits=${ocrCredits} aiCredits=${aiCredits} ` +
        `actual=${actual} budget=${budget}`,
    );

    expect(actual).toBeLessThanOrEqual(budget);
  });
});
