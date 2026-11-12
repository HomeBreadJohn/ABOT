import { z } from "zod";

import { documentCategorySchema } from "@/contracts/common";
import type { DocumentCategory } from "@/contracts/common";
import type { ChatProvider } from "@/lib/providers/chat-provider";
import { buildClassifyPrompt } from "@/features/intelligence/prompts/classify";

/** Minimal page shape; avoids importing the provider's NormalizedPage. */
export type ClassifiablePage = { pageNumber: number; text: string };

export type Classification = {
  category: DocumentCategory;
  subtype: string;
  issuer: string;
  confidence: number;
  ambiguous: boolean;
};

const AMBIGUOUS_CONFIDENCE = 0.7;
const AMBIGUOUS_MARGIN = 0.15;

const replySchema = z.object({
  category: documentCategorySchema,
  subtype: z.string().default(""),
  issuer: z.string().default(""),
  confidence: z.number().min(0).max(1),
  candidates: z
    .array(
      z.object({
        category: documentCategorySchema,
        confidence: z.number().min(0).max(1),
      }),
    )
    .optional(),
});

/** Strip code fences and extract the first balanced JSON object, or null. */
function extractJson(reply: string): unknown {
  const fenced = reply.replace(/```(?:json)?/gi, "");
  const start = fenced.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  for (let i = start; i < fenced.length; i++) {
    if (fenced[i] === "{") depth++;
    else if (fenced[i] === "}") {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(fenced.slice(start, i + 1));
        } catch {
          return null;
        }
      }
    }
  }
  return null;
}

function isAmbiguous(
  confidence: number,
  candidates: { confidence: number }[] | undefined,
): boolean {
  if (confidence < AMBIGUOUS_CONFIDENCE) return true;
  if (candidates && candidates.length >= 2) {
    const sorted = [...candidates].sort((a, b) => b.confidence - a.confidence);
    if (sorted[0].confidence - sorted[1].confidence < AMBIGUOUS_MARGIN) {
      return true;
    }
  }
  return false;
}

/**
 * Classify a document from its OCR text using one chat message. An invalid or
 * unparseable reply yields category OTHER with ambiguous=true (never throws).
 */
export async function classifyDocument(
  pages: ClassifiablePage[],
  chat: ChatProvider,
): Promise<Classification> {
  const text = pages.map((p) => p.text).join("\n");
  const { sessionId } = await chat.openSession();
  const { reply } = await chat.send(sessionId, buildClassifyPrompt(text));

  const parsed = replySchema.safeParse(extractJson(reply));
  if (!parsed.success) {
    return { category: "OTHER", subtype: "", issuer: "", confidence: 0, ambiguous: true };
  }

  const r = parsed.data;
  return {
    category: r.category,
    subtype: r.subtype,
    issuer: r.issuer,
    confidence: r.confidence,
    ambiguous: isAmbiguous(r.confidence, r.candidates),
  };
}
