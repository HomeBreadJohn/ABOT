import { describe, expect, it } from "vitest";

import documentFixture from "@/lib/lumen/__fixtures__/ocr/document.json";
import pagesFixture from "@/lib/lumen/__fixtures__/ocr/pages.json";
import {
  ocrDocumentSchema,
  ocrPagesSchema,
  ocrUploadResponseSchema,
} from "@/lib/lumen/ocr-schemas";

describe("ocr-schemas", () => {
  it("parses the captured document record fixture", () => {
    const parsed = ocrDocumentSchema.parse(documentFixture.data);
    expect(parsed.DocumentID).toBe("ea942043-7e94-46e1-97c0-e8f578049507");
    expect(parsed.Status).toBe("READY");
    expect(parsed.PageCount).toBe(2);
    expect(parsed.FailedPageNumbers).toEqual([]);
  });

  it("parses the captured pages fixture with words", () => {
    const parsed = ocrPagesSchema.parse(pagesFixture.data);
    expect(parsed.IncludesWords).toBe(true);
    expect(parsed.Items).toHaveLength(2);
    expect(parsed.Items[0].PageNumber).toBe(1);
    expect(parsed.Items[0].Words[0].text).toBe("SAMPLE");
  });

  it("accepts an unmeasured confidence with no numeric score", () => {
    const parsed = ocrPagesSchema.parse(pagesFixture.data);
    const confidence = parsed.Items[0].Words[0].confidence;
    expect(confidence.measured).toBe(false);
    expect(confidence.reason).toBe("not_reported");
    // No numeric score is present on an unmeasured confidence.
    expect(confidence).not.toHaveProperty("value");
  });

  it("rejects a page missing its Words array when words are included", () => {
    const broken = {
      IncludesWords: true,
      Items: [
        {
          DocumentID: "d1",
          PageNumber: 1,
          Origin: "text_layer",
          ToSource: { a: 1, b: 0, c: 0, d: 0, e: 1, f: 0 },
          Raster: { widthPx: 100, heightPx: 100, dpi: 72 },
          Confidence: { measured: false, reason: "not_reported" },
          // Words omitted
        },
      ],
    };
    expect(() => ocrPagesSchema.parse(broken)).toThrow();
  });

  it("parses an upload 202 body carrying a DocumentID", () => {
    const parsed = ocrUploadResponseSchema.parse({ DocumentID: "doc-9" });
    expect(parsed.DocumentID).toBe("doc-9");
  });
});
