import { createLumenProvider } from "@/lib/ai/providers/lumen-provider";
import {
  type AnalyzeDocumentInput,
  parseDocumentAnalysis,
} from "@/lib/ai/providers/ai-provider";

export async function analyzeDocument(input: AnalyzeDocumentInput) {
  const result = await createLumenProvider().analyzeDocument(input);
  return parseDocumentAnalysis(result);
}
