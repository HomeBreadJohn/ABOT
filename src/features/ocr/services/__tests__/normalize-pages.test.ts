import { describe, expect, it } from "vitest";

import pagesFixture from "@/lib/lumen/__fixtures__/ocr/pages.json";
import { ocrPagesSchema } from "@/lib/lumen/ocr-schemas";
import { normalizePages } from "@/features/ocr/services/normalize-pages";

const pages = ocrPagesSchema.parse(pagesFixture.data);

describe("normalizePages", () => {
  it("joins words in reading order with single spaces", () => {
    const [page1] = normalizePages(pages);
    expect(page1.pageNumber).toBe(1);
    expect(page1.status).toBe("READY");
    expect(page1.text.startsWith("SAMPLE - FICTITIOUS DOCUMENT FOR SOFTWARE")).toBe(
      true,
    );
  });

  it("gives each word a 0-based index per page", () => {
    const [page1] = normalizePages(pages);
    expect(page1.words[0].index).toBe(0);
    expect(page1.words[1].index).toBe(1);
    expect(page1.words[page1.words.length - 1].index).toBe(
      page1.words.length - 1,
    );
  });

  it("maps unmeasured confidence to null and averages to null", () => {
    const [page1] = normalizePages(pages);
    expect(page1.words.every((w) => w.confidence === null)).toBe(true);
    expect(page1.averageConfidence).toBeNull();
  });

  it("averages only measured word confidences", () => {
    const synthetic = {
      IncludesWords: true,
      Items: [
        {
          DocumentID: "d1",
          PageNumber: 1,
          Origin: "text_layer",
          ToSource: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          Raster: { widthPx: 100, heightPx: 100, dpi: 72 },
          Confidence: { measured: false, reason: "not_reported" },
          Words: [
            {
              text: "A",
              box: { x: 0, y: 0, w: 1, h: 1 },
              confidence: { measured: true, value: 0.8, unit: "word" },
            },
            {
              text: "B",
              box: { x: 0, y: 0, w: 1, h: 1 },
              confidence: { measured: false, reason: "not_reported" },
            },
            {
              text: "C",
              box: { x: 0, y: 0, w: 1, h: 1 },
              confidence: { measured: true, value: 0.6, unit: "word" },
            },
          ],
        },
      ],
    };
    const parsed = ocrPagesSchema.parse(synthetic);
    const [page] = normalizePages(parsed);
    expect(page.words[0].confidence).toBe(0.8);
    expect(page.words[1].confidence).toBeNull();
    expect(page.averageConfidence).toBeCloseTo(0.7);
  });

  it("marks a PARTIAL doc's failed pages FAILED with empty text", () => {
    const [p1, p2] = normalizePages(pages, [2]);
    expect(p1.status).toBe("READY");
    expect(p2.status).toBe("FAILED");
    expect(p2.text).toBe("");
    expect(p2.words).toEqual([]);
  });
});
