import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const evidenceDirectory = dirname(fileURLToPath(import.meta.url));

function readSource(fileName: string) {
  return readFileSync(join(evidenceDirectory, fileName), "utf8");
}

describe("evidence viewer markup", () => {
  const viewer = readSource("evidence-viewer.tsx");

  it("is a client component", () => {
    expect(viewer.startsWith('"use client";')).toBe(true);
  });

  it("is a modal dialog labelled by its title and described by its summary", () => {
    expect(viewer).toContain('role="dialog"');
    expect(viewer).toContain('aria-modal="true"');
    expect(viewer).toContain("aria-labelledby={titleId}");
    expect(viewer).toContain("aria-describedby={descriptionId}");
    expect(viewer).toContain("<h2 id={titleId}");
  });

  it("has a named close button and closes on Escape", () => {
    expect(viewer).toMatch(/onClick=\{onClose\}[\s\S]*?Close\s*<\/Button>/);
    expect(viewer).toContain('event.key === "Escape"');
  });

  it("traps Tab inside the dialog and returns focus to the opener", () => {
    expect(viewer).toContain('event.key !== "Tab"');
    expect(viewer).toContain("last.focus()");
    expect(viewer).toContain("first.focus()");
    expect(viewer).toContain("opener.focus()");
    expect(viewer).toContain("returnFocusRef");
    expect(viewer).toContain("panelRef.current?.focus()");
  });

  it("announces loading, errors, and unreadable pages", () => {
    expect(viewer).toMatch(/role="status"[^>]*>\s*Loading page/);
    expect(viewer).toContain('role="alert"');
    expect(viewer).toContain("This page could not be read.");
    expect(viewer).toContain("safeMessageFor(error)");
  });

  it("never renders a raw error message", () => {
    expect(viewer).not.toMatch(/error\.message/);
  });

  it("labels page navigation with the target page number", () => {
    expect(viewer).toContain("`Previous page, page ${previous}`");
    expect(viewer).toContain("`Next page, page ${next}`");
  });

  it("offers the original file through the signed-url helper in a new tab", () => {
    expect(viewer).toContain("Open original file");
    expect(viewer).toContain("(opens in a new tab)");
    expect(viewer).toContain("getDocumentSignedUrl");
  });

  it("injects getPage by default", () => {
    expect(viewer).toContain(
      'import { getPage } from "@/lib/api-client/analysis"',
    );
    expect(viewer).toContain("fetchPage = getPage");
  });

  it("explains both cues in a visible legend", () => {
    expect(viewer).toContain('aria-label="Legend"');
    expect(viewer).toContain("marks the cited passage");
    expect(viewer).toContain("marks a word the reader was unsure of");
  });

  it("labels the source as OCR text or your correction", () => {
    expect(viewer).toContain('OCR_TEXT: "OCR text"');
    expect(viewer).toContain('USER_CORRECTION: "Your correction"');
  });
});

describe("evidence page text markup", () => {
  const pageText = readSource("evidence-page-text.tsx");

  it("marks the cited run with more than colour", () => {
    expect(pageText).toContain("<mark");
    expect(pageText).toContain("outline-2");
    expect(pageText).toContain("Cited passage starts.");
    expect(pageText).toContain("Cited passage ends.");
  });

  it("marks low-confidence words with underline, a visible marker, and a screen-reader note", () => {
    expect(pageText).toContain("underline decoration-dotted");
    expect(pageText).toMatch(
      /<sup[^>]*aria-hidden="true"[^>]*>\s*\?\s*<\/sup>/,
    );
    expect(pageText).toContain("(low confidence)");
  });
});
