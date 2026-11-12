import { createHash } from "node:crypto";

/**
 * Minimal input shape for chunking. A local definition on purpose: Task B13
 * adapts the richer `NormalizedPage` (a structural supertype of this) to this
 * function. Do not import from `src/lib/providers/**` here.
 */
export type ChunkablePage = {
  pageNumber: number;
  status: "READY" | "FAILED";
  text: string;
};

export type Chunk = {
  index: number;
  pageStart: number;
  pageEnd: number;
  content: string;
  contentHash: string;
};

export type ChunkResult = {
  chunks: Chunk[];
  /** Page numbers of FAILED pages, in input order. */
  failedPages: number[];
};

const DEFAULT_MAX_CHARS = 2400;

/**
 * Split OCR pages into bounded chunks for per-chunk AI analysis.
 *
 * Each READY page contributes a `[p<N>]` marker followed by its text. Pieces
 * are packed into chunks on paragraph boundaries first, then sentence
 * boundaries, so no chunk exceeds `maxChars`. FAILED pages are skipped and
 * their numbers returned in `failedPages`. `contentHash` is a SHA-256 of the
 * chunk content, so repeated runs over the same input are deterministic.
 */
export function chunkPages(
  pages: ChunkablePage[],
  opts?: { maxChars?: number },
): ChunkResult {
  const maxChars = opts?.maxChars ?? DEFAULT_MAX_CHARS;
  const failedPages: number[] = [];

  // Flatten pages into page-tagged pieces small enough to pack into a chunk.
  const pieces: { page: number; text: string }[] = [];
  for (const page of pages) {
    if (page.status === "FAILED") {
      failedPages.push(page.pageNumber);
      continue;
    }
    const marker = `[p${page.pageNumber}]`;
    const body = `${marker} ${page.text}`.trim();
    for (const piece of splitToFit(body, maxChars)) {
      pieces.push({ page: page.pageNumber, text: piece });
    }
  }

  // Pack pieces into chunks without exceeding maxChars. Pieces from different
  // pages are joined with a blank line; a piece always fits by construction.
  const chunks: Chunk[] = [];
  let buffer = "";
  let pageStart = 0;
  let pageEnd = 0;

  const flush = () => {
    if (!buffer) return;
    chunks.push({
      index: chunks.length,
      pageStart,
      pageEnd,
      content: buffer,
      contentHash: createHash("sha256").update(buffer).digest("hex"),
    });
    buffer = "";
  };

  for (const piece of pieces) {
    if (!buffer) {
      buffer = piece.text;
      pageStart = piece.page;
      pageEnd = piece.page;
      continue;
    }
    const candidate = `${buffer}\n\n${piece.text}`;
    if (candidate.length <= maxChars) {
      buffer = candidate;
      pageEnd = piece.page;
    } else {
      flush();
      buffer = piece.text;
      pageStart = piece.page;
      pageEnd = piece.page;
    }
  }
  flush();

  return { chunks, failedPages };
}

/**
 * Break `text` into pieces no longer than `maxChars`, splitting on paragraph
 * boundaries first, then sentence boundaries, then a hard character cut as a
 * last resort for a single oversized sentence.
 */
function splitToFit(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const pieces: string[] = [];
  for (const paragraph of text.split(/\n{2,}/)) {
    const trimmed = paragraph.trim();
    if (!trimmed) continue;
    if (trimmed.length <= maxChars) {
      pieces.push(trimmed);
      continue;
    }
    for (const sentence of splitSentences(trimmed)) {
      if (sentence.length <= maxChars) {
        pieces.push(sentence);
      } else {
        for (let i = 0; i < sentence.length; i += maxChars) {
          pieces.push(sentence.slice(i, i + maxChars));
        }
      }
    }
  }
  return pieces;
}

/** Split on sentence terminators, keeping the terminator with its sentence. */
function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
