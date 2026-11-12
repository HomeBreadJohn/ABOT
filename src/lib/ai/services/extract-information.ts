import { createLumenProvider } from "@/lib/ai/providers/lumen-provider";
import {
  parseExtractedData,
  type AnalyzeDocumentInput,
} from "@/lib/ai/providers/ai-provider";

export async function extractInformation(input: AnalyzeDocumentInput) {
  const result = await createLumenProvider().extractInformation(input);
  return parseExtractedData(result);
}
