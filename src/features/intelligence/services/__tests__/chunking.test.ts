import { describe, expect, it } from "vitest";

import {
  chunkPages,
  type ChunkablePage,
} from "@/features/intelligence/services/chunking";

const MAX = 2400;

function ready(pageNumber: number, text: string): ChunkablePage {
  return { pageNumber, status: "READY", text };
}

function failed(pageNumber: number): ChunkablePage {
  return { pageNumber, status: "FAILED", text: "" };
}

describe("chunkPages", () => {
  it("prefixes each page's text with a [p<N>] marker", () => {
    const { chunks } = chunkPages([ready(1, "Hello world."), ready(2, "Second page.")]);
    const joined = chunks.map((c) => c.content).join("\n");
    expect(joined).toContain("[p1]");
    expect(joined).toContain("[p2]");
  });

  it("keeps every chunk at or under maxChars", () => {
    // A single page far larger than maxChars, built from many paragraphs.
    const paragraphs = Array.from({ length: 50 }, (_, i) =>
      `Paragraph ${i} with several words that take up room.`,
    );
    const { chunks } = chunkPages([ready(1, paragraphs.join("\n\n"))]);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(MAX);
    }
  });

  it("respects a custom maxChars", () => {
    const paragraphs = Array.from({ length: 20 }, (_, i) => `Para ${i} body text here.`);
    const { chunks } = chunkPages([ready(1, paragraphs.join("\n\n"))], { maxChars: 200 });
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(200);
    }
  });

  it("splits on paragraph boundaries before sentence boundaries", () => {
    // Two paragraphs that each fit, together exceeding maxChars, must split
    // between the paragraphs (not mid-sentence).
    const para = "word ".repeat(40).trim(); // ~200 chars
    const { chunks } = chunkPages([ready(1, `${para}\n\n${para}`)], { maxChars: 250 });
    expect(chunks.length).toBe(2);
    // Neither chunk should contain both paragraphs' worth of text.
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(250);
    }
  });

  it("splits on sentence boundaries when a paragraph alone exceeds maxChars", () => {
    const sentences = Array.from({ length: 10 }, (_, i) => `Sentence number ${i} is here.`);
    const oneParagraph = sentences.join(" ");
    const { chunks } = chunkPages([ready(1, oneParagraph)], { maxChars: 120 });
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.content.length).toBeLessThanOrEqual(120);
    }
  });

  it("covers every READY page in some chunk's page range", () => {
    const pages = [ready(1, "A."), ready(2, "B."), ready(3, "C.")];
    const { chunks } = chunkPages(pages);
    const covered = new Set<number>();
    for (const chunk of chunks) {
      for (let p = chunk.pageStart; p <= chunk.pageEnd; p++) covered.add(p);
    }
    expect(covered.has(1)).toBe(true);
    expect(covered.has(2)).toBe(true);
    expect(covered.has(3)).toBe(true);
  });

  it("skips FAILED pages and reports their numbers", () => {
    const pages = [ready(1, "A."), failed(2), ready(3, "C.")];
    const { chunks, failedPages } = chunkPages(pages);
    expect(failedPages).toEqual([2]);
    // A FAILED page contributes no content and no marker.
    const joined = chunks.map((c) => c.content).join("\n");
    expect(joined).not.toContain("[p2]");
    expect(joined).toContain("[p1]");
    expect(joined).toContain("[p3]");
  });

  it("produces identical contentHash values across two calls on a 30-page input", () => {
    const pages: ChunkablePage[] = Array.from({ length: 30 }, (_, i) => {
      const n = i + 1;
      const body = Array.from({ length: 8 }, (_, j) =>
        `Page ${n} paragraph ${j} with some representative sentence content.`,
      ).join("\n\n");
      return ready(n, body);
    });
    const first = chunkPages(pages);
    const second = chunkPages(pages);
    expect(first.chunks.length).toBe(second.chunks.length);
    expect(first.chunks.map((c) => c.contentHash)).toEqual(
      second.chunks.map((c) => c.contentHash),
    );
  });

  it("assigns sequential chunk indexes starting at 0", () => {
    const { chunks } = chunkPages([ready(1, "a"), ready(2, "b"), ready(3, "c")], {
      maxChars: 20,
    });
    chunks.forEach((chunk, i) => expect(chunk.index).toBe(i));
  });
});
