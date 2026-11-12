import type { NormalizedPage } from "@/lib/providers/ocr-provider";

/**
 * A stored correction projected onto OCR words. `correctedValue` is null for an
 * UNREADABLE correction (the user could not read it either); the words stay but
 * are still marked as reviewed. `createdAt` orders supersession when two
 * corrections cover the same range.
 */
export type EffectiveCorrection = {
  pageNumber: number;
  wordStart: number;
  wordEnd: number;
  correctedValue: string | null;
  createdAt?: string;
};

/** A NormalizedPage word that also records where its text came from. */
type EffectiveWord = NormalizedPage["words"][number] & {
  sourceType: "OCR_TEXT" | "USER_CORRECTION";
};

export type EffectivePage = Omit<NormalizedPage, "words"> & {
  words: EffectiveWord[];
};

/**
 * Overlay corrections onto OCR pages: corrected word ranges are marked
 * USER_CORRECTION (so downstream evidence for those ranges carries that source
 * type), and the corrected text replaces the OCR text on the range's first word
 * when a value is present. Inputs are never mutated. When two corrections cover
 * the same range, the newer one (later createdAt) wins.
 */
export function buildEffectivePages(
  pages: NormalizedPage[],
  corrections: EffectiveCorrection[],
): EffectivePage[] {
  return pages.map((page) => {
    const words: EffectiveWord[] = page.words.map((w) => ({
      ...w,
      sourceType: "OCR_TEXT",
    }));

    const forPage = corrections
      .filter((c) => c.pageNumber === page.pageNumber)
      .sort((a, b) => (a.createdAt ?? "").localeCompare(b.createdAt ?? ""));

    for (const c of forPage) {
      for (let i = c.wordStart; i <= c.wordEnd && i < words.length; i++) {
        words[i] = { ...words[i], sourceType: "USER_CORRECTION" };
      }
      // Put the corrected value on the first word of the range; UNREADABLE
      // (null) leaves the OCR text in place but keeps the USER_CORRECTION mark.
      if (c.correctedValue !== null && c.wordStart < words.length) {
        words[c.wordStart] = { ...words[c.wordStart], text: c.correctedValue };
      }
    }

    return { ...page, words };
  });
}
