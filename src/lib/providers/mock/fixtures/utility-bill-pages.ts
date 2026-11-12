import type { NormalizedPage } from "@/lib/providers/ocr-provider";

// Deterministic mock OCR output for a two-page utility bill. The text contains
// the exact evidence excerpts used in mockUtilityBillAnalysis so downstream
// evidence mapping can find them.
const PAGE_1_TEXT = [
  "Sample Electric Cooperative",
  "Amount Due: PHP 2,450.00",
  "Due Date: December 15, 2026",
  "Consumption: 250 kWh",
].join("\n");

const PAGE_2_TEXT = "A surcharge applies to payments after the due date.";

/** Splits text into words with a fixed confidence so the fixture is stable. */
function toPage(pageNumber: number, text: string): NormalizedPage {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ index, text: word, confidence: 0.95 }));
  return {
    pageNumber,
    status: "READY",
    text,
    words,
    averageConfidence: words.length === 0 ? null : 0.95,
  };
}

export const utilityBillPages: NormalizedPage[] = [
  toPage(1, PAGE_1_TEXT),
  toPage(2, PAGE_2_TEXT),
];

// Partial variant: page 1 reads fine, page 2 failed to process.
export const partialUtilityBillPages: NormalizedPage[] = [
  toPage(1, PAGE_1_TEXT),
  { pageNumber: 2, status: "FAILED", text: "", words: [], averageConfidence: null },
];
