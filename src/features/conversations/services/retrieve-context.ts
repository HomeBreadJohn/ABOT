import "server-only";

export type ContextEvidence = { id: string; excerpt: string };

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "is",
  "are",
  "of",
  "to",
  "in",
  "on",
  "for",
  "and",
  "or",
  "my",
  "how",
  "much",
  "what",
  "when",
  "who",
  "this",
  "that",
  "it",
  "do",
  "does",
  "i",
]);

/** Lower-cased alphanumeric tokens, stop words removed. */
function keywords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/** Count of question keywords that appear in the excerpt. */
function overlapScore(questionWords: Set<string>, excerpt: string): number {
  const words = new Set(keywords(excerpt));
  let score = 0;
  for (const w of questionWords) if (words.has(w)) score += 1;
  return score;
}

/**
 * Pick the evidence excerpts most relevant to the question, ranked by keyword
 * overlap (descending), keeping only those with at least one overlapping word.
 * Stops once `charBudget` of excerpt text is used, so the follow-up message
 * stays within the chat budget. Original order of equal-score items is stable.
 */
export function selectEvidence(
  question: string,
  evidence: ContextEvidence[],
  charBudget: number,
): ContextEvidence[] {
  const questionWords = new Set(keywords(question));

  const scored = evidence
    .map((ev, index) => ({
      ev,
      index,
      score: overlapScore(questionWords, ev.excerpt),
    }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index);

  const picked: ContextEvidence[] = [];
  let used = 0;
  for (const { ev } of scored) {
    const cost = ev.id.length + ev.excerpt.length + 4;
    if (used + cost > charBudget) continue;
    picked.push(ev);
    used += cost;
  }
  return picked;
}
