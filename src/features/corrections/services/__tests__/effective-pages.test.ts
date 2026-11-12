import { describe, expect, it } from "vitest";

import {
  buildEffectivePages,
  type EffectiveCorrection,
} from "@/features/corrections/services/effective-pages";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";

function pages(): NormalizedPage[] {
  return [
    {
      pageNumber: 1,
      status: "READY",
      text: "Total amount due 1,250.00",
      words: [
        { index: 0, text: "Total", confidence: 0.9 },
        { index: 1, text: "amount", confidence: 0.9 },
        { index: 2, text: "due", confidence: 0.9 },
        { index: 3, text: "1,250.00", confidence: 0.4 },
      ],
      averageConfidence: 0.75,
    },
  ];
}

describe("buildEffectivePages", () => {
  it("marks corrected word ranges as USER_CORRECTION and applies the corrected text", () => {
    const corrections: EffectiveCorrection[] = [
      { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" },
    ];

    const result = buildEffectivePages(pages(), corrections);

    const word = result[0].words[3];
    expect(word.sourceType).toBe("USER_CORRECTION");
    expect(word.text).toBe("1,260.00");
    // Uncorrected words keep OCR as their source.
    expect(result[0].words[0].sourceType).toBe("OCR_TEXT");
  });

  it("marks an UNREADABLE range as USER_CORRECTION without changing the OCR text", () => {
    const corrections: EffectiveCorrection[] = [
      { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: null },
    ];

    const result = buildEffectivePages(pages(), corrections);

    expect(result[0].words[3].sourceType).toBe("USER_CORRECTION");
    expect(result[0].words[3].text).toBe("1,250.00");
  });

  it("does not mutate the input pages", () => {
    const input = pages();
    const corrections: EffectiveCorrection[] = [
      { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00" },
    ];

    buildEffectivePages(input, corrections);

    expect(input[0].words[3].text).toBe("1,250.00");
    expect(input[0].words[3]).not.toHaveProperty("sourceType");
  });

  it("lets a newer correction for the same range win over an older one", () => {
    const corrections: EffectiveCorrection[] = [
      { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,260.00", createdAt: "2026-01-01T00:00:00.000Z" },
      { pageNumber: 1, wordStart: 3, wordEnd: 3, correctedValue: "1,275.00", createdAt: "2026-01-02T00:00:00.000Z" },
    ];

    const result = buildEffectivePages(pages(), corrections);

    expect(result[0].words[3].text).toBe("1,275.00");
  });
});
