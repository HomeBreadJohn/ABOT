import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import type { OcrPages } from "@/lib/lumen/ocr-schemas";

/**
 * Normalizes a Lumen pages response into the provider-neutral NormalizedPage
 * shape. Page text is the words joined in order with single spaces; each word's
 * index is its 0-based position on the page; a word's confidence is the numeric
 * score only when `measured` is true, else null; averageConfidence is the mean
 * of the measured scores, or null when none are measured.
 *
 * `failedPageNumbers` names pages that failed in a PARTIAL document; those come
 * back as FAILED with empty text and words.
 */
export function normalizePages(
  raw: OcrPages,
  failedPageNumbers: number[] = [],
): NormalizedPage[] {
  const failed = new Set(failedPageNumbers);

  return raw.Items.map((page) => {
    if (failed.has(page.PageNumber)) {
      return {
        pageNumber: page.PageNumber,
        status: "FAILED",
        text: "",
        words: [],
        averageConfidence: null,
      };
    }

    const words = page.Words.map((word, index) => ({
      index,
      text: word.text,
      confidence:
        word.confidence.measured && typeof word.confidence.value === "number"
          ? word.confidence.value
          : null,
    }));

    const measured = words
      .map((w) => w.confidence)
      .filter((c): c is number => c !== null);
    const averageConfidence =
      measured.length > 0
        ? measured.reduce((sum, c) => sum + c, 0) / measured.length
        : null;

    return {
      pageNumber: page.PageNumber,
      status: "READY",
      text: words.map((w) => w.text).join(" "),
      words,
      averageConfidence,
    };
  });
}
