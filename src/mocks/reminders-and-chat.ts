import type { Conversation, Message, Reminder } from "@/contracts";

import { MOCK_CONVERSATION_ID, MOCK_DOCUMENT_IDS } from "./ids";

export const mockReminders: Reminder[] = [
  {
    id: "cd3e4f50-8192-4da3-9eb4-2f3a4b5c6d18",
    documentId: MOCK_DOCUMENT_IDS.utilityBill,
    title: "Pay electricity bill",
    description: "Confirm the amount first, then pay before the due date.",
    dueAt: "2026-11-20T17:00:00+08:00",
    reminderAt: "2026-11-18T09:00:00+08:00",
    status: "PENDING",
    createdAt: "2026-11-15T10:10:00+08:00",
  },
  {
    id: "de4f5061-92a3-4eb4-8fc5-3a4b5c6d7e19",
    documentId: MOCK_DOCUMENT_IDS.governmentNotice,
    title: "Submit pension validation documents",
    description: "Use the earlier date (Dec 5) until the office confirms.",
    dueAt: "2026-12-05T17:00:00+08:00",
    reminderAt: "2026-12-01T09:00:00+08:00",
    status: "PENDING",
    createdAt: "2026-11-15T11:25:00+08:00",
  },
  {
    id: "ef506172-a3b4-4fc5-9ad6-4b5c6d7e8f1a",
    documentId: null,
    title: "Renew passport appointment",
    description: null,
    dueAt: "2026-10-30T09:00:00+08:00",
    reminderAt: null,
    status: "COMPLETED",
    createdAt: "2026-10-01T08:00:00+08:00",
  },
];

export const mockConversation: Conversation = {
  id: MOCK_CONVERSATION_ID,
  documentId: MOCK_DOCUMENT_IDS.employmentContract,
  createdAt: "2026-11-15T09:40:00+08:00",
};

/** Grounded answer: the assistant cites an evidence reference. */
export const mockMessages: Message[] = [
  {
    id: "f6071829-b4c5-4ad6-8be7-5c6d7e8f9a1b",
    conversationId: MOCK_CONVERSATION_ID,
    role: "USER",
    content: "What happens if I resign without notice?",
    citations: [],
    createdAt: "2026-11-15T09:41:00+08:00",
  },
  {
    id: "07182930-c5d6-4be7-9cf8-6d7e8f9a0b1c",
    conversationId: MOCK_CONVERSATION_ID,
    role: "ASSISTANT",
    content:
      "The contract says you would owe the company an amount equal to one month of salary. That is stated in the termination clause on page 3. I can only explain what the document says. For advice on whether this applies to you, please ask a lawyer or the DOLE.",
    citations: [
      {
        id: "ev-6",
        documentId: MOCK_DOCUMENT_IDS.employmentContract,
        pageNumber: 3,
        excerpt:
          "Failure to render the required notice shall make the Employee liable to pay the Company an amount equivalent to one (1) month salary.",
        sourceType: "OCR_TEXT",
        wordStart: 17,
        wordEnd: 40,
      },
    ],
    createdAt: "2026-11-15T09:41:20+08:00",
  },
];
