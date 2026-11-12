import { z } from "zod";

export const extractedDataSchema = z.record(z.string(), z.unknown());

export const documentAnalysisSchema = z.object({
  documentType: z.string().min(1).nullable(),
  extractedData: extractedDataSchema,
  explanation: z.string().nullable(),
  confidence: z.number().min(0).max(1).nullable(),
});

export type DocumentAnalysis = z.infer<typeof documentAnalysisSchema>;
