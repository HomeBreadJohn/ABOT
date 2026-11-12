import { createLumenProvider } from "@/lib/ai/providers/lumen-provider";
import {
  parseDocumentClassification,
  type ClassifyDocumentInput,
} from "@/lib/ai/providers/ai-provider";

export async function classifyDocument(input: ClassifyDocumentInput) {
  const result = await createLumenProvider().classifyDocument(input);
  return parseDocumentClassification(result);
}
