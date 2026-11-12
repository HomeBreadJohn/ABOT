/**
 * Shared safety rules from product.md section 8, embedded in every analysis
 * prompt. Keep these short: they count against the 4000-char chat limit.
 */

export const PROMPT_VERSION = "1";

/**
 * The section-8 AI safety rules as one reusable block. Every chunk and
 * consolidation prompt embeds this verbatim so the model is bound by the same
 * boundaries regardless of which message it is answering.
 */
export const SYSTEM_RULES = [
  "Safety rules you must always follow:",
  "- Never invent missing information. If something is not in the document, say so.",
  "- Separate facts from inferences. Mark anything you infer as INFERRED, not FOUND.",
  "- Never call a document fraudulent without clear evidence in the document.",
  "- Never claim to take any action on the user's behalf (submit, sign, pay, contact).",
  "- Quote the exact text from the document for every finding; never paraphrase a quote.",
].join("\n");
