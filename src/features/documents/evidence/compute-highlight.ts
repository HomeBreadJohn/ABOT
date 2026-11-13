/**
 * Pure helpers that turn an evidence word range (`wordStart..wordEnd`, both
 * inclusive) into a highlight over the words of a fetched page. Ranges are
 * matched against each word's `index` field, not its array position.
 */

export interface HighlightRangeInput {
  readonly wordStart?: number | undefined;
  readonly wordEnd?: number | undefined;
}

export type HighlightFallbackReason =
  /** wordStart or wordEnd is missing: show the excerpt without a range. */
  | "no-range"
  /** The range is negative, fractional, or ends before it starts. */
  | "invalid-range"
  /** The page has no words to highlight. */
  | "no-words"
  /** The range does not overlap any word on the page. */
  | "out-of-range";

export type HighlightResult =
  | {
      readonly kind: "range";
      /** First highlighted word index (inclusive, after clamping). */
      readonly start: number;
      /** Last highlighted word index (inclusive, after clamping). */
      readonly end: number;
      /** True when the cited range extended past the words on the page. */
      readonly clamped: boolean;
    }
  | { readonly kind: "none"; readonly reason: HighlightFallbackReason };

function isWordIndex(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

/**
 * Resolve the cited range against the page's words. Returns `kind: "none"`
 * with a reason whenever there is nothing safe to highlight, so callers can
 * fall back to showing the excerpt alone.
 */
export function computeHighlight(
  range: HighlightRangeInput,
  words: readonly { readonly index: number }[],
): HighlightResult {
  const { wordStart, wordEnd } = range;
  if (wordStart === undefined || wordEnd === undefined) {
    return { kind: "none", reason: "no-range" };
  }
  if (!isWordIndex(wordStart) || !isWordIndex(wordEnd) || wordEnd < wordStart) {
    return { kind: "none", reason: "invalid-range" };
  }
  if (words.length === 0) {
    return { kind: "none", reason: "no-words" };
  }

  let firstIndex = Infinity;
  let lastIndex = -Infinity;
  for (const word of words) {
    if (word.index < firstIndex) firstIndex = word.index;
    if (word.index > lastIndex) lastIndex = word.index;
  }

  if (wordEnd < firstIndex || wordStart > lastIndex) {
    return { kind: "none", reason: "out-of-range" };
  }

  const start = Math.max(wordStart, firstIndex);
  const end = Math.min(wordEnd, lastIndex);
  return {
    kind: "range",
    start,
    end,
    clamped: start !== wordStart || end !== wordEnd,
  };
}

/**
 * Fixed explanation shown when the cited words cannot be shown exactly, or
 * null when the range was resolved in full. The excerpt is always visible, so
 * the copy points to it.
 */
export function highlightNotice(highlight: HighlightResult): string | null {
  if (highlight.kind === "range") {
    return highlight.clamped
      ? "Part of the cited range falls outside this page, so only the part on this page is marked."
      : null;
  }
  if (highlight.reason === "no-range") {
    return "This evidence points to the page but not to exact words. The quoted excerpt is shown above.";
  }
  return "We couldn't find the exact cited words on this page. The quoted excerpt is shown above.";
}

/** True when a word index falls inside the highlight (inclusive). */
export function isWordHighlighted(
  index: number,
  highlight: HighlightResult,
): boolean {
  return (
    highlight.kind === "range" &&
    index >= highlight.start &&
    index <= highlight.end
  );
}

export interface WordSegment<TWord extends { readonly index: number }> {
  readonly cited: boolean;
  readonly words: readonly TWord[];
}

/**
 * Group consecutive words into plain and cited runs, so the viewer can wrap
 * one cited run in a single marked element with start and end markers.
 */
export function segmentWords<TWord extends { readonly index: number }>(
  words: readonly TWord[],
  highlight: HighlightResult,
): readonly WordSegment<TWord>[] {
  const segments: { cited: boolean; words: TWord[] }[] = [];
  for (const word of words) {
    const cited = isWordHighlighted(word.index, highlight);
    const last = segments.at(-1);
    if (last && last.cited === cited) {
      last.words.push(word);
    } else {
      segments.push({ cited, words: [word] });
    }
  }
  return segments;
}
