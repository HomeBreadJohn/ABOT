import { describe, expect, it } from "vitest";

import {
  mapQuoteToEvidence,
  type EvidencePage,
} from "@/features/intelligence/services/evidence-mapping";

function page(pageNumber: number, words: string[]): EvidencePage {
  return {
    pageNumber,
    text: words.join(" "),
    words: words.map((text, index) => ({ index, text, confidence: 0.99 })),
  };
}

const utilityBill = page(1, [
  "Meralco",
  "Electric",
  "Bill",
  "Amount",
  "Due",
  "PHP",
  "2,450.00",
  "on",
  "November",
  "30",
]);

describe("mapQuoteToEvidence", () => {
  it("returns the word range and confidence 1 for an exact match", () => {
    const match = mapQuoteToEvidence("Amount Due", 1, [utilityBill]);
    expect(match).not.toBeNull();
    expect(match!.pageNumber).toBe(1);
    expect(match!.wordStart).toBe(3);
    expect(match!.wordEnd).toBe(4);
    expect(match!.matchConfidence).toBe(1);
  });

  it("matches regardless of case and whitespace", () => {
    const match = mapQuoteToEvidence("  amount   DUE  ", 1, [utilityBill]);
    expect(match).not.toBeNull();
    expect(match!.wordStart).toBe(3);
    expect(match!.wordEnd).toBe(4);
    expect(match!.matchConfidence).toBe(1);
  });

  it("accepts an OCR-noisy match via Dice score above the threshold", () => {
    // "Arnount Due" vs "Amount Due": an OCR misread of m->rn.
    const match = mapQuoteToEvidence("Arnount Due", 1, [utilityBill]);
    expect(match).not.toBeNull();
    expect(match!.matchConfidence).toBeGreaterThanOrEqual(0.7);
    expect(match!.matchConfidence).toBeLessThan(1);
  });

  it("finds a quote on an adjacent page when the claimed page is wrong", () => {
    const pageOne = page(1, ["Cover", "sheet", "only"]);
    const pageTwo = utilityBill; // real content on page 2
    const withTwo = { ...pageTwo, pageNumber: 2 };
    const match = mapQuoteToEvidence("Amount Due", 1, [pageOne, withTwo]);
    expect(match).not.toBeNull();
    expect(match!.pageNumber).toBe(2);
    expect(match!.matchConfidence).toBe(1);
  });

  it("returns null for a fabricated quote", () => {
    const match = mapQuoteToEvidence(
      "Your account has been permanently closed by order of the court",
      1,
      [utilityBill],
    );
    expect(match).toBeNull();
  });

  it("builds the excerpt from the OCR words, never the input quote", () => {
    // Caller passes a lowercase, differently-spaced quote; excerpt must come from OCR.
    const match = mapQuoteToEvidence("arnount due", 1, [utilityBill]);
    expect(match).not.toBeNull();
    expect(match!.excerpt).toBe("Amount Due");
    expect(match!.excerpt).not.toBe("arnount due");
  });
});
