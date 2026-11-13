import { describe, expect, it } from "vitest";

import {
  computeHighlight,
  highlightNotice,
  isWordHighlighted,
  segmentWords,
} from "@/features/documents/evidence/compute-highlight";

const words = (count: number, offset = 0) =>
  Array.from({ length: count }, (_, i) => ({
    index: i + offset,
    text: `w${i}`,
  }));

describe("computeHighlight", () => {
  it("treats wordStart and wordEnd as an inclusive range", () => {
    const result = computeHighlight({ wordStart: 2, wordEnd: 4 }, words(10));
    expect(result).toEqual({ kind: "range", start: 2, end: 4, clamped: false });
    expect(isWordHighlighted(2, result)).toBe(true);
    expect(isWordHighlighted(4, result)).toBe(true);
    expect(isWordHighlighted(1, result)).toBe(false);
    expect(isWordHighlighted(5, result)).toBe(false);
  });

  it("supports a single-word range and the first and last word", () => {
    expect(computeHighlight({ wordStart: 3, wordEnd: 3 }, words(5))).toEqual({
      kind: "range",
      start: 3,
      end: 3,
      clamped: false,
    });
    expect(computeHighlight({ wordStart: 0, wordEnd: 0 }, words(5)).kind).toBe(
      "range",
    );
    expect(computeHighlight({ wordStart: 4, wordEnd: 4 }, words(5)).kind).toBe(
      "range",
    );
  });

  it("clamps a range that runs past the end of the page", () => {
    expect(computeHighlight({ wordStart: 3, wordEnd: 99 }, words(5))).toEqual({
      kind: "range",
      start: 3,
      end: 4,
      clamped: true,
    });
  });

  it("matches on each word's index, not its array position", () => {
    const result = computeHighlight(
      { wordStart: 12, wordEnd: 13 },
      words(5, 10),
    );
    expect(result).toEqual({
      kind: "range",
      start: 12,
      end: 13,
      clamped: false,
    });
  });

  it("falls back when wordStart or wordEnd is missing", () => {
    expect(computeHighlight({}, words(5))).toEqual({
      kind: "none",
      reason: "no-range",
    });
    expect(computeHighlight({ wordStart: 1 }, words(5))).toEqual({
      kind: "none",
      reason: "no-range",
    });
    expect(computeHighlight({ wordEnd: 1 }, words(5))).toEqual({
      kind: "none",
      reason: "no-range",
    });
  });

  it("falls back when the range is entirely outside the page", () => {
    expect(computeHighlight({ wordStart: 8, wordEnd: 9 }, words(5))).toEqual({
      kind: "none",
      reason: "out-of-range",
    });
  });

  it("falls back for negative, fractional, or reversed ranges", () => {
    for (const range of [
      { wordStart: -1, wordEnd: 2 },
      { wordStart: 0.5, wordEnd: 2 },
      { wordStart: 4, wordEnd: 2 },
      { wordStart: Number.NaN, wordEnd: 2 },
    ]) {
      expect(computeHighlight(range, words(5))).toEqual({
        kind: "none",
        reason: "invalid-range",
      });
    }
  });

  it("falls back when the page has no words", () => {
    expect(computeHighlight({ wordStart: 0, wordEnd: 1 }, [])).toEqual({
      kind: "none",
      reason: "no-words",
    });
  });
});

describe("segmentWords", () => {
  it("groups consecutive words into plain and cited runs", () => {
    const highlight = computeHighlight({ wordStart: 2, wordEnd: 3 }, words(6));
    const segments = segmentWords(words(6), highlight);
    expect(segments.map((s) => [s.cited, s.words.map((w) => w.index)])).toEqual(
      [
        [false, [0, 1]],
        [true, [2, 3]],
        [false, [4, 5]],
      ],
    );
  });

  it("returns one plain run when nothing is highlighted", () => {
    const segments = segmentWords(words(3), {
      kind: "none",
      reason: "no-range",
    });
    expect(segments).toHaveLength(1);
    expect(segments[0]?.cited).toBe(false);
  });

  it("returns no segments for no words", () => {
    expect(segmentWords([], { kind: "none", reason: "no-words" })).toEqual([]);
  });
});

describe("highlightNotice", () => {
  it("is silent for a fully resolved range", () => {
    expect(
      highlightNotice({ kind: "range", start: 1, end: 2, clamped: false }),
    ).toBeNull();
  });

  it("explains clamped and fallback cases with fixed copy", () => {
    expect(
      highlightNotice({ kind: "range", start: 1, end: 2, clamped: true }),
    ).toMatch(/outside this page/);
    expect(highlightNotice({ kind: "none", reason: "no-range" })).toMatch(
      /not to exact words/,
    );
    expect(highlightNotice({ kind: "none", reason: "out-of-range" })).toMatch(
      /couldn't find the exact cited words/,
    );
  });
});
