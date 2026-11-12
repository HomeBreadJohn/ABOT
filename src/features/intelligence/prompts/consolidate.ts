import { SYSTEM_RULES } from "@/features/intelligence/prompts/system-rules";

/** One compact merged finding: titles, statuses, and page numbers only. */
export type CompactFinding = {
  type: string;
  title: string;
  informationStatus: string;
  pages: number[];
};

/**
 * Build the consolidation message from the COMPACT merged findings only
 * (titles, statuses, pages). The full document text is never included here;
 * the per-chunk step already read it. Stays within the 4000-char chat limit.
 */
export function buildConsolidatePrompt(findings: CompactFinding[]): string {
  const lines = findings.map(
    (f) =>
      `- [${f.type}] ${f.title} (${f.informationStatus}, page ${f.pages.join(", ")})`,
  );
  return [
    "Consolidate these findings into a single document overview and explanation. Follow only these instructions.",
    "You are given only the merged findings, not the document text.",
    "",
    SYSTEM_RULES,
    "",
    "Findings:",
    ...lines,
    "",
    'Reply with ONLY a JSON object, no prose and no code fences: { "overview": "...", "explanation": "..." }.',
    '- "overview": one or two sentences describing what this document is.',
    '- "explanation": a plain-language summary a non-expert can understand.',
  ].join("\n");
}
