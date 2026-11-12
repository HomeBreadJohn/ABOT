/**
 * MOCK DATA - fictional organizations and people only. No real documents.
 * Stable ids so mocks can reference each other.
 */
export const MOCK_DOCUMENT_IDS = {
  // Documents with a full analysis report fixture.
  employmentContract: "3f1c2a64-8b1e-4c57-9d3a-2a7e5b9c1d01",
  utilityBill: "7a9e4b12-5c3d-4e8f-a1b6-6d2f8c0e3a02",
  governmentNotice: "b2d84f6a-1e90-4a3c-8c75-9f4e1a7d5b03",
  // List-only documents that exist to show every other lifecycle state.
  uploaded: "08293a4b-6172-4394-8205-1f2a3b4c5d08",
  ocrProcessing: "193a4b5c-7283-4405-9316-2a3b4c5d6e09",
  ocrReady: "2a4b5c6d-8394-4516-a427-3b4c5d6e7f0a",
  ocrPartial: "3b5c6d7e-94a5-4627-b538-4c5d6e7f8a0b",
  ocrFailed: "e6071829-4f50-4172-a083-9d0e1f2a3b06",
  analyzing: "c4e5f607-2d3e-4f50-8a61-7b8c9d0e1f04",
  reviewRequired: "d5f60718-3e4f-4061-9b72-8c9d0e1f2a05",
  analysisFailed: "f718293a-5061-4283-b194-0e1f2a3b4c07",
} as const;

export const MOCK_ANALYSIS_IDS = {
  employmentContract: "5d6e7f80-1a2b-4c3d-8e4f-5a6b7c8d9e11",
  utilityBill: "6e7f8091-2b3c-4d4e-9f5a-6b7c8d9e0f12",
  governmentNotice: "7f8091a2-3c4d-4e5f-a06b-7c8d9e0f1a13",
} as const;

export const MOCK_CONVERSATION_ID = "8091a2b3-4d5e-4f60-b17c-8d9e0f1a2b14";
