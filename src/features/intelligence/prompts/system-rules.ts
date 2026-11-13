/**
 * Shared safety rules from product.md section 8, embedded in every analysis
 * prompt. Keep these short: they count against the ~1900-char chat limit, so
 * the chunk framing stays small enough to carry real document text.
 */

export const PROMPT_VERSION = "2";

/**
 * The section-8 AI safety rules as one reusable block. Every chunk and
 * consolidation prompt embeds this verbatim so the model is bound by the same
 * boundaries regardless of which message it is answering. All five boundaries
 * are kept; only their wording is compressed.
 */
export const SYSTEM_RULES = [
  "Safety rules (always):",
  "- Never invent missing info; if it is not in the document, say so.",
  "- Mark anything inferred as INFERRED, not FOUND.",
  "- Never call a document fraudulent without clear evidence in it.",
  "- Never claim to act for the user (submit, sign, pay, contact).",
  "- Quote the document's exact text for every finding; never paraphrase a quote.",
].join("\n");
