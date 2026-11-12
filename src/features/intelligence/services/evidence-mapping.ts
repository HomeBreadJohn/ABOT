/**
 * Maps an AI-produced quote back to the exact OCR word span that supports it.
 *
 * Anti-hallucination guarantee: the returned `excerpt` is always rebuilt from
 * the OCR words of the matched span, never from the caller's `quote`. A quote
 * that does not appear in the OCR text (exactly or as a close OCR misread)
 * returns `null`, so a fabricated quote can never be presented as evidence.
 *
 * Local minimal input shape — intentionally NOT imported from the provider
 * layer, which a parallel task owns.
 */
export type EvidencePage = {
  pageNumber: number;
  text: string;
  words: { index: number; text: string; confidence: number | null }[];
};

export type EvidenceMatch = {
  pageNumber: number;
  wordStart: number;
  wordEnd: number;
  excerpt: string;
  matchConfidence: number;
};

// A single within-word OCR misread (m->rn) scores ~0.74 by char bigrams, so
// 0.85 would reject it; 0.7 accepts close misreads while still rejecting
// unrelated text.
const FUZZY_THRESHOLD = 0.7;

function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Dice coefficient over the character bigrams of two strings. */
function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const bg = a.slice(i, i + 2);
    bigrams.set(bg, (bigrams.get(bg) ?? 0) + 1);
  }
  let overlap = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const bg = b.slice(i, i + 2);
    const count = bigrams.get(bg) ?? 0;
    if (count > 0) {
      bigrams.set(bg, count - 1);
      overlap++;
    }
  }
  return (2 * overlap) / (a.length - 1 + (b.length - 1));
}

/** Rebuild the excerpt from the OCR words covering [wordStart, wordEnd]. */
function excerptOf(page: EvidencePage, wordStart: number, wordEnd: number): string {
  return page.words
    .slice(wordStart, wordEnd + 1)
    .map((w) => w.text)
    .join(" ");
}

/**
 * Exact normalized substring match on one page. Builds the page's normalized
 * text from its words so the matched character span maps straight back to the
 * covering word indices.
 */
function exactMatch(page: EvidencePage, normalizedQuote: string): EvidenceMatch | null {
  // Char offset of each word within the normalized, space-joined page text.
  const offsets: { start: number; end: number; index: number }[] = [];
  let cursor = 0;
  const parts: string[] = [];
  for (const word of page.words) {
    const norm = normalize(word.text);
    if (norm === "") continue;
    if (parts.length > 0) cursor += 1; // the joining space
    offsets.push({ start: cursor, end: cursor + norm.length, index: word.index });
    parts.push(norm);
    cursor += norm.length;
  }
  const pageText = parts.join(" ");
  const hit = pageText.indexOf(normalizedQuote);
  if (hit === -1) return null;

  const hitEnd = hit + normalizedQuote.length;
  const covered = offsets.filter((o) => o.end > hit && o.start < hitEnd);
  if (covered.length === 0) return null;
  const wordStart = covered[0].index;
  const wordEnd = covered[covered.length - 1].index;
  return {
    pageNumber: page.pageNumber,
    wordStart,
    wordEnd,
    excerpt: excerptOf(page, wordStart, wordEnd),
    matchConfidence: 1,
  };
}

/**
 * Token-level fuzzy match: slide a window over the page's words sized to the
 * quote's token count ±2, score each by Dice on the joined normalized tokens,
 * and return the best window scoring >= FUZZY_THRESHOLD.
 */
function fuzzyMatch(page: EvidencePage, normalizedQuote: string): EvidenceMatch | null {
  const quoteTokens = normalizedQuote.split(" ").filter(Boolean);
  if (quoteTokens.length === 0) return null;

  const tokens = page.words
    .map((w) => ({ index: w.index, norm: normalize(w.text) }))
    .filter((t) => t.norm !== "");
  if (tokens.length === 0) return null;

  let best: EvidenceMatch | null = null;
  const minSize = Math.max(1, quoteTokens.length - 2);
  const maxSize = quoteTokens.length + 2;

  for (let size = minSize; size <= maxSize; size++) {
    for (let start = 0; start + size <= tokens.length; start++) {
      const window = tokens.slice(start, start + size);
      const candidate = window.map((t) => t.norm).join(" ");
      const score = diceCoefficient(normalizedQuote, candidate);
      if (score >= FUZZY_THRESHOLD && (best === null || score > best.matchConfidence)) {
        const wordStart = window[0].index;
        const wordEnd = window[window.length - 1].index;
        best = {
          pageNumber: page.pageNumber,
          wordStart,
          wordEnd,
          excerpt: excerptOf(page, wordStart, wordEnd),
          matchConfidence: score,
        };
      }
    }
  }
  return best;
}

/**
 * Finds the OCR word span that supports `quote`. Tries an exact normalized
 * match on the claimed page, then its neighbours (±1), then a token-level
 * fuzzy match in the same page order. Returns `null` when nothing matches.
 */
export function mapQuoteToEvidence(
  quote: string,
  page: number,
  pages: EvidencePage[],
): EvidenceMatch | null {
  const normalizedQuote = normalize(quote);
  if (normalizedQuote === "") return null;

  // Search the claimed page first, then adjacent pages.
  const order = [page, page - 1, page + 1]
    .map((n) => pages.find((p) => p.pageNumber === n))
    .filter((p): p is EvidencePage => p !== undefined);

  for (const p of order) {
    const match = exactMatch(p, normalizedQuote);
    if (match) return match;
  }
  for (const p of order) {
    const match = fuzzyMatch(p, normalizedQuote);
    if (match) return match;
  }
  return null;
}
