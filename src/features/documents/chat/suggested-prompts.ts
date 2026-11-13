import type { ExplanationLanguage } from "@/contracts";

/** Starter questions from product.md section 9.5. */
export const SUGGESTED_PROMPTS = [
  { id: "simplify", text: "Explain this in simpler terms." },
  { id: "missed-deadline", text: "What happens if I miss the deadline?" },
  { id: "which-part", text: "Which part of the document says that?" },
  { id: "ask-office", text: "What should I ask the issuing office?" },
  { id: "filipino", text: "Explain this in Filipino." },
] as const;

export type SuggestedPrompt = (typeof SUGGESTED_PROMPTS)[number];

/**
 * Orders the starter questions. When the reader is already using Filipino or
 * Taglish, the "Explain this in Filipino" question comes first. The send
 * contract has no language field, so the hint only changes the order.
 */
export function orderSuggestedPrompts(
  languageHint?: ExplanationLanguage,
): readonly SuggestedPrompt[] {
  if (languageHint !== "FIL" && languageHint !== "TAGLISH") {
    return SUGGESTED_PROMPTS;
  }
  const filipino = SUGGESTED_PROMPTS.filter((p) => p.id === "filipino");
  const rest = SUGGESTED_PROMPTS.filter((p) => p.id !== "filipino");
  return [...filipino, ...rest];
}
