import type { EvidenceReference } from "@/contracts";

export type Citation = {
  evidenceId: string;
  /** Short visible button text. */
  label: string;
  /** Longer accessible name that includes a snippet of the quoted text. */
  description: string;
};

const SNIPPET_LENGTH = 80;

/**
 * Builds citation buttons for an assistant answer. Duplicate IDs collapse to
 * one button. An ID that is not in `evidence` still gets a button labelled
 * "Source n", so the host can decide what to do with it. Nothing is invented
 * about its page or text.
 */
export function buildCitations(
  evidenceIds: readonly string[],
  evidence: readonly EvidenceReference[],
): Citation[] {
  const unique = [...new Set(evidenceIds)];
  return unique.map((evidenceId, index) => {
    const item = evidence.find((e) => e.id === evidenceId);
    const source = `Source ${index + 1}`;
    // The accessible name starts with the visible label.
    if (!item) {
      return {
        evidenceId,
        label: source,
        description: `${source}. Show this part of the document.`,
      };
    }
    const label = `${source} · Page ${item.pageNumber}`;
    return {
      evidenceId,
      label,
      description: `${label}. Show this part of the document: "${snippet(item.excerpt)}"`,
    };
  });
}

function snippet(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > SNIPPET_LENGTH
    ? `${flat.slice(0, SNIPPET_LENGTH).trimEnd()}…`
    : flat;
}
