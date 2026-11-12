/**
 * Mock data for UI development (Person 1). Replaced by real endpoints in
 * Phase 8. Everything here is fictional.
 */
import type { AnalysisResult } from "@/contracts";

import { employmentContractAnalysis } from "./analysis/employment-contract";
import { governmentNoticeAnalysis } from "./analysis/government-notice";
import { utilityBillAnalysis } from "./analysis/utility-bill";
import { MOCK_ANALYSIS_IDS, MOCK_DOCUMENT_IDS } from "./ids";

export {
  MOCK_ANALYSIS_IDS,
  MOCK_CONVERSATION_ID,
  MOCK_DOCUMENT_IDS,
} from "./ids";
export { mockDocuments } from "./documents";
export { employmentContractFilipino } from "./translations";
export {
  mockConversation,
  mockMessages,
  mockReminders,
} from "./reminders-and-chat";
export {
  employmentContractAnalysis,
  governmentNoticeAnalysis,
  utilityBillAnalysis,
};

/** Report fixtures keyed by document id. List-only documents have none. */
export const mockAnalysesByDocumentId: Record<string, AnalysisResult> = {
  [MOCK_DOCUMENT_IDS.employmentContract]: employmentContractAnalysis,
  [MOCK_DOCUMENT_IDS.utilityBill]: utilityBillAnalysis,
  [MOCK_DOCUMENT_IDS.governmentNotice]: governmentNoticeAnalysis,
};

export const mockAnalysisIdByDocumentId: Record<string, string> = {
  [MOCK_DOCUMENT_IDS.employmentContract]: MOCK_ANALYSIS_IDS.employmentContract,
  [MOCK_DOCUMENT_IDS.utilityBill]: MOCK_ANALYSIS_IDS.utilityBill,
  [MOCK_DOCUMENT_IDS.governmentNotice]: MOCK_ANALYSIS_IDS.governmentNotice,
};
