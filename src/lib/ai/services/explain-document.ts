import { createLumenProvider } from "@/lib/ai/providers/lumen-provider";
import {
  parseExplanation,
  type ExplainDocumentInput,
} from "@/lib/ai/providers/ai-provider";

export async function explainDocument(input: ExplainDocumentInput) {
  const result = await createLumenProvider().explainDocument(input);
  return parseExplanation(result);
}
