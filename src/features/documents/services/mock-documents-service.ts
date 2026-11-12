import "server-only";
import { randomUUID } from "node:crypto";
import { z } from "zod";

import {
  mockNeedsCorrectionAnalysis,
  mockPartialAnalysis,
  mockUtilityBillAnalysis,
  reminderSchema,
  documentListItemSchema,
  lifecycleToStage,
} from "@/contracts";
import { requireUser } from "@/lib/auth/require-user";

import { deriveDocumentTitle } from "./supabase-row-mappers";
import {
  DocumentsServiceError,
  type DocumentsService,
  type DeadlineSignal,
  type FinalizeUploadInput,
  type PrepareUploadInput,
  type PreparedUpload,
  type DiscardUploadInput,
  type ListDocumentsResult,
} from "./documents-service";
import {
  LIFECYCLE_UPLOAD_POLICY,
  type UploadPolicy,
} from "../upload/upload-policy";
import { validateFileForUpload } from "../upload/upload-helpers";

type DocumentSummary = z.infer<typeof documentListItemSchema>;
type Reminder = z.infer<typeof reminderSchema>;

const DEFAULT_MOCK_TODAY = "2026-11-15";
const MAX_DOCUMENTS = 200;

const FIXTURE_DOCUMENT_IDS = {
  utilityBill: "00000000-0000-4000-8000-000000000001",
  partialStatement: "00000000-0000-4000-8000-000000000002",
  needsCorrection: "00000000-0000-4000-8000-000000000003",
} as const;

const FIXTURE_DOCUMENTS: readonly DocumentSummary[] = [
  {
    documentId: FIXTURE_DOCUMENT_IDS.utilityBill,
    title: "Electric bill",
    lifecycle: "COMPLETED",
    stage: lifecycleToStage("COMPLETED"),
    category: "UTILITIES",
    analysisStatus: "SUCCEEDED",
    nextDeadline: mockUtilityBillAnalysis.importantDates[0]?.date ?? null,
    needsAttention: false,
    createdAt: "2026-11-01T08:00:00.000Z",
  },
  {
    documentId: FIXTURE_DOCUMENT_IDS.partialStatement,
    title: mockPartialAnalysis.document.documentSubtype ?? "Loan statement",
    lifecycle: "REVIEW_REQUIRED",
    stage: lifecycleToStage("REVIEW_REQUIRED"),
    category: "FINANCIAL",
    analysisStatus: "SUCCEEDED",
    nextDeadline: null,
    needsAttention: true,
    createdAt: "2026-11-02T08:00:00.000Z",
  },
  {
    documentId: FIXTURE_DOCUMENT_IDS.needsCorrection,
    title: "Water bill",
    lifecycle: "NEEDS_CORRECTION",
    stage: lifecycleToStage("NEEDS_CORRECTION"),
    category: "UTILITIES",
    analysisStatus: "SUCCEEDED",
    nextDeadline: mockNeedsCorrectionAnalysis.importantDates[0]?.date ?? null,
    needsAttention: true,
    createdAt: "2026-11-03T08:00:00.000Z",
  },
];

const FIXTURE_DEADLINE_SIGNALS: readonly DeadlineSignal[] = [
  {
    documentId: FIXTURE_DOCUMENT_IDS.utilityBill,
    sourceItemId:
      mockUtilityBillAnalysis.importantDates[0]?.id ?? "utility-due",
    title:
      mockUtilityBillAnalysis.importantDates[0]?.title ?? "Payment due date",
    date: mockUtilityBillAnalysis.importantDates[0]?.date ?? null,
    informationStatus:
      mockUtilityBillAnalysis.importantDates[0]?.informationStatus ?? "FOUND",
    provisional: false,
  },
  {
    documentId: FIXTURE_DOCUMENT_IDS.needsCorrection,
    sourceItemId:
      mockNeedsCorrectionAnalysis.importantDates[0]?.id ?? "water-due",
    title:
      mockNeedsCorrectionAnalysis.importantDates[0]?.title ??
      "Payment due date",
    date: mockNeedsCorrectionAnalysis.importantDates[0]?.date ?? null,
    informationStatus:
      mockNeedsCorrectionAnalysis.importantDates[0]?.informationStatus ??
      "FOUND",
    provisional: true,
  },
];

const FIXTURE_REMINDERS: readonly Reminder[] = [
  reminderSchema.parse({
    id: "mock-reminder-utility-due",
    documentId: FIXTURE_DOCUMENT_IDS.utilityBill,
    title: "Pay the electric bill",
    dueAt: "2026-12-15T09:00:00.000Z",
    status: "ACTIVE",
    notes: "The due date comes from the sample bill.",
  }),
];

type PreparedMetadata = {
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSize: number;
};

type UserUploadStore = {
  readonly pending: Map<string, PreparedMetadata>;
  readonly documents: Map<string, DocumentSummary>;
};

const uploadsByUser = new Map<string, UserUploadStore>();

export interface MockDocumentsServiceOptions {
  readonly today?: string;
}

function storeForUser(userId: string): UserUploadStore {
  const existing = uploadsByUser.get(userId);
  if (existing) return existing;

  const store: UserUploadStore = {
    pending: new Map(),
    documents: new Map(),
  };
  uploadsByUser.set(userId, store);
  return store;
}

async function requireAuthenticatedUser(): Promise<string> {
  try {
    const { userId } = await requireUser();
    if (typeof userId !== "string" || userId.length === 0) {
      throw new Error("Missing authenticated user");
    }
    return userId;
  } catch {
    throw new DocumentsServiceError("UNAUTHENTICATED", false);
  }
}

function invalidRequest(): never {
  throw new DocumentsServiceError("INVALID_REQUEST", false);
}

function validateUploadInput(
  input: PrepareUploadInput | FinalizeUploadInput,
): PreparedMetadata {
  if (
    !input ||
    typeof input !== "object" ||
    typeof input.originalFilename !== "string" ||
    input.originalFilename.trim().length === 0 ||
    input.originalFilename.trim().length > 1024 ||
    typeof input.mimeType !== "string" ||
    typeof input.fileSize !== "number" ||
    !Number.isInteger(input.fileSize)
  ) {
    return invalidRequest();
  }

  const originalFilename = input.originalFilename.trim();
  const validation = validateFileForUpload(
    {
      name: originalFilename,
      type: input.mimeType,
      size: input.fileSize,
    },
    LIFECYCLE_UPLOAD_POLICY,
  );

  if (!validation.ok) {
    if (validation.reason === "UNSUPPORTED_TYPE") {
      throw new DocumentsServiceError("UNSUPPORTED_FILE", false);
    }
    throw new DocumentsServiceError("INVALID_REQUEST", false);
  }

  return {
    originalFilename: validation.originalFilename,
    mimeType: validation.mimeType,
    fileSize: input.fileSize,
  };
}

function sameUploadMetadata(
  left: PreparedMetadata,
  right: PreparedMetadata,
): boolean {
  return (
    left.originalFilename === right.originalFilename &&
    left.mimeType === right.mimeType &&
    left.fileSize === right.fileSize
  );
}

function createUploadedDocument(
  documentId: string,
  input: PreparedMetadata,
  today: string,
): DocumentSummary {
  return {
    documentId,
    title: deriveDocumentTitle(input.originalFilename),
    lifecycle: "UPLOADED",
    stage: lifecycleToStage("UPLOADED"),
    category: null,
    analysisStatus: "NONE",
    nextDeadline: null,
    needsAttention: false,
    createdAt: `${today}T12:00:00.000Z`,
  };
}

function sortDocuments(
  documents: readonly DocumentSummary[],
): DocumentSummary[] {
  return [...documents].sort(
    (left, right) =>
      right.createdAt.localeCompare(left.createdAt) ||
      right.documentId.localeCompare(left.documentId),
  );
}

export function createMockDocumentsService(
  options: MockDocumentsServiceOptions = {},
): DocumentsService {
  const today = options.today ?? DEFAULT_MOCK_TODAY;

  return {
    source: "mock",
    capabilities: { reminders: true, deadlineCertainty: true },

    getUploadPolicy(): UploadPolicy {
      return LIFECYCLE_UPLOAD_POLICY;
    },

    async listDocuments(options): Promise<ListDocumentsResult> {
      const userId = await requireAuthenticatedUser();
      const store = storeForUser(userId);
      const requestedLimit = options?.limit;
      const limit = Math.min(
        MAX_DOCUMENTS,
        Math.max(
          0,
          typeof requestedLimit === "number" && Number.isInteger(requestedLimit)
            ? requestedLimit
            : MAX_DOCUMENTS,
        ),
      );
      const documents = sortDocuments([
        ...FIXTURE_DOCUMENTS,
        ...store.documents.values(),
      ]);

      return { documents: documents.slice(0, limit), skippedCount: 0 };
    },

    async getDocument(documentId: string): Promise<DocumentSummary | null> {
      const userId = await requireAuthenticatedUser();
      if (
        typeof documentId !== "string" ||
        !z.uuid().safeParse(documentId).success
      ) {
        return null;
      }

      return (
        FIXTURE_DOCUMENTS.find(
          (document) => document.documentId === documentId,
        ) ??
        storeForUser(userId).documents.get(documentId) ??
        null
      );
    },

    async listDeadlineSignals(): Promise<readonly DeadlineSignal[]> {
      await requireAuthenticatedUser();
      return FIXTURE_DEADLINE_SIGNALS.map((signal) => ({ ...signal }));
    },

    async listReminders(): Promise<readonly Reminder[]> {
      await requireAuthenticatedUser();
      return [...FIXTURE_REMINDERS];
    },

    async prepareUpload(input: PrepareUploadInput): Promise<PreparedUpload> {
      const userId = await requireAuthenticatedUser();
      const metadata = validateUploadInput(input);
      const documentId = randomUUID();
      storeForUser(userId).pending.set(documentId, metadata);

      return { transport: "mock", documentId };
    },

    async finalizeUpload(input: FinalizeUploadInput): Promise<DocumentSummary> {
      const userId = await requireAuthenticatedUser();
      if (
        typeof input.documentId !== "string" ||
        !z.uuid().safeParse(input.documentId).success
      ) {
        return invalidRequest();
      }

      const metadata = validateUploadInput(input);
      const store = storeForUser(userId);
      const existing = store.documents.get(input.documentId);
      if (existing) return existing;

      const prepared = store.pending.get(input.documentId);
      if (!prepared) {
        throw new DocumentsServiceError("NOT_FOUND", false);
      }
      if (!sameUploadMetadata(prepared, metadata)) {
        throw new DocumentsServiceError("INVALID_REQUEST", false);
      }

      const document = createUploadedDocument(
        input.documentId,
        metadata,
        today,
      );
      store.pending.delete(input.documentId);
      store.documents.set(input.documentId, document);
      return document;
    },

    async discardUpload(input: DiscardUploadInput): Promise<void> {
      const userId = await requireAuthenticatedUser();
      if (
        !input ||
        typeof input !== "object" ||
        typeof input.documentId !== "string"
      ) {
        return;
      }
      const store = storeForUser(userId);
      if (store.documents.has(input.documentId)) return;
      store.pending.delete(input.documentId);
    },
  };
}
