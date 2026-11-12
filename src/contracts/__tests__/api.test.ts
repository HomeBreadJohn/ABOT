import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  API_ERROR_HTTP_STATUS,
  createDocumentRequestSchema,
  createDocumentResponseSchema,
  uploadCompleteResponseSchema,
  deleteDocumentResponseSchema,
  documentListItemSchema,
  documentDetailResponseSchema,
  analyzeResponseSchema,
  analysisByIdResponseSchema,
  analysisResponseSchema,
  crossAnalyzeRequestSchema,
  sendMessageRequestSchema,
  // every request schema, for the strictness sweep:
  getAnalysisQuerySchema,
  openConversationRequestSchema,
  listMessagesRequestSchema,
  listCorrectionsRequestSchema,
  deleteReminderRequestSchema,
  uploadCompleteRequestSchema,
  submitCorrectionsRequestSchema,
  reviewRelationshipRequestSchema,
  suggestRelationshipsRequestSchema,
  updateDocumentRequestSchema,
  updateReminderRequestSchema,
  createReminderRequestSchema,
  analyzeRequestSchema,
  deleteDocumentRequestSchema,
} from "@/contracts/api";
import { mockUtilityBillAnalysis } from "@/contracts/mock-analysis";

const FORBIDDEN_OWNER_KEYS = ["userId", "ownerId", "user_id"] as const;

const REQUEST_SCHEMAS = [
  ["createDocumentRequestSchema", createDocumentRequestSchema],
  ["uploadCompleteRequestSchema", uploadCompleteRequestSchema],
  ["updateDocumentRequestSchema", updateDocumentRequestSchema],
  ["deleteDocumentRequestSchema", deleteDocumentRequestSchema],
  ["analyzeRequestSchema", analyzeRequestSchema],
  ["getAnalysisQuerySchema", getAnalysisQuerySchema],
  ["submitCorrectionsRequestSchema", submitCorrectionsRequestSchema],
  ["listCorrectionsRequestSchema", listCorrectionsRequestSchema],
  ["openConversationRequestSchema", openConversationRequestSchema],
  ["sendMessageRequestSchema", sendMessageRequestSchema],
  ["listMessagesRequestSchema", listMessagesRequestSchema],
  ["suggestRelationshipsRequestSchema", suggestRelationshipsRequestSchema],
  ["reviewRelationshipRequestSchema", reviewRelationshipRequestSchema],
  ["crossAnalyzeRequestSchema", crossAnalyzeRequestSchema],
  ["createReminderRequestSchema", createReminderRequestSchema],
  ["updateReminderRequestSchema", updateReminderRequestSchema],
  ["deleteReminderRequestSchema", deleteReminderRequestSchema],
] as const;

describe("request schemas reject owner fields", () => {
  it.each(REQUEST_SCHEMAS.map(([name, schema]) => ({ name, schema })))(
    "$name rejects userId, ownerId, and user_id",
    ({ schema }) => {
      for (const key of FORBIDDEN_OWNER_KEYS) {
        expect(schema.safeParse({ [key]: "someone-else" }).success).toBe(false);
      }
    },
  );
});

describe("createDocumentRequestSchema", () => {
  const valid = {
    originalFilename: "bill.pdf",
    mimeType: "application/pdf",
    fileSize: 12345,
  };

  it("accepts a valid registration", () => {
    expect(createDocumentRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects text/plain, zero, and oversize files", () => {
    expect(
      createDocumentRequestSchema.safeParse({
        ...valid,
        mimeType: "text/plain",
      }).success,
    ).toBe(false);
    expect(
      createDocumentRequestSchema.safeParse({ ...valid, fileSize: 0 }).success,
    ).toBe(false);
    expect(
      createDocumentRequestSchema.safeParse({ ...valid, fileSize: 10485761 })
        .success,
    ).toBe(false);
  });
});

describe("analysisResponseSchema", () => {
  it("accepts PROCESSING with a stage and no analysis", () => {
    expect(
      analysisResponseSchema.safeParse({
        state: "PROCESSING",
        stage: "UNDERSTANDING",
      }).success,
    ).toBe(true);
  });

  it("accepts FAILED with an errorCode and no analysis", () => {
    expect(
      analysisResponseSchema.safeParse({
        state: "FAILED",
        errorCode: "PROVIDER_UNAVAILABLE",
        message: "Analysis failed.",
      }).success,
    ).toBe(true);
  });

  it("rejects PROCESSING that carries an analysis field", () => {
    expect(
      analysisResponseSchema.safeParse({
        state: "PROCESSING",
        stage: "UNDERSTANDING",
        analysis: {},
      }).success,
    ).toBe(false);
  });
});

describe("crossAnalyzeRequestSchema", () => {
  const ids = (n: number) => ({
    documentIds: Array.from({ length: n }, (_, i) => `d-${i}`),
  });

  it("accepts 2 to 5 document IDs", () => {
    expect(crossAnalyzeRequestSchema.safeParse(ids(2)).success).toBe(true);
    expect(crossAnalyzeRequestSchema.safeParse(ids(5)).success).toBe(true);
  });

  it("rejects fewer than 2 and more than 5", () => {
    expect(crossAnalyzeRequestSchema.safeParse(ids(1)).success).toBe(false);
    expect(crossAnalyzeRequestSchema.safeParse(ids(6)).success).toBe(false);
  });
});

describe("sendMessageRequestSchema", () => {
  it("accepts a message of exactly 1,000 characters and rejects 1,001", () => {
    expect(
      sendMessageRequestSchema.safeParse({ content: "a".repeat(1000) }).success,
    ).toBe(true);
    expect(
      sendMessageRequestSchema.safeParse({ content: "a".repeat(1001) }).success,
    ).toBe(false);
  });
});

describe("apiErrorSchema", () => {
  it("accepts the shared error shape", () => {
    expect(
      apiErrorSchema.safeParse({
        error: {
          code: "NOT_FOUND",
          message: "No such document.",
          requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      }).success,
    ).toBe(true);
    expect(
      apiErrorSchema.safeParse({
        error: {
          code: "INVALID_REQUEST",
          message: "Bad request.",
          issues: [{ path: ["body", "fileSize"], message: "Too large" }],
          requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown code", () => {
    expect(
      apiErrorSchema.safeParse({
        error: {
          code: "SOMETHING_BROKE",
          message: "x",
          requestId: "3f2504e0-4f89-11d3-9a0c-0305e82c3301",
        },
      }).success,
    ).toBe(false);
  });
});

describe("API_ERROR_HTTP_STATUS", () => {
  it("maps every code to its status", () => {
    expect(API_ERROR_HTTP_STATUS).toEqual({
      UNAUTHENTICATED: 401,
      FORBIDDEN: 403,
      NOT_FOUND: 404,
      INVALID_REQUEST: 400,
      CONFLICT: 409,
      NOT_READY: 409,
      UNSUPPORTED_FILE: 415,
      RATE_LIMITED: 429,
      PROVIDER_UNAVAILABLE: 503,
      INVALID_ANALYSIS: 502,
      INTERNAL_ERROR: 500,
    });
  });
});

const UUID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("createDocumentResponseSchema", () => {
  const valid = {
    documentId: UUID,
    storagePath: `${UUID}/${UUID}/bill.pdf`,
    uploadToken: "signed-upload-token",
    uploadUrl:
      "https://supabase.example/storage/v1/upload/sign/bucket/bill.pdf",
  };

  it("accepts all four fields required by createSignedUploadUrl", () => {
    expect(createDocumentResponseSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects missing or empty storagePath and uploadToken", () => {
    for (const key of ["storagePath", "uploadToken"]) {
      expect(
        createDocumentResponseSchema.safeParse({ ...valid, [key]: "" }).success,
      ).toBe(false);
      const missing = { ...valid };
      delete missing[key as keyof typeof missing];
      expect(createDocumentResponseSchema.safeParse(missing).success).toBe(
        false,
      );
    }
  });

  it("rejects a non-uuid documentId and a non-URL uploadUrl", () => {
    expect(
      createDocumentResponseSchema.safeParse({ ...valid, documentId: "doc-1" })
        .success,
    ).toBe(false);
    expect(
      createDocumentResponseSchema.safeParse({
        ...valid,
        uploadUrl: "not-a-url",
      }).success,
    ).toBe(false);
  });
});

describe("uuid IDs in API schemas", () => {
  it("rejects non-uuid documentId in document responses", () => {
    expect(
      uploadCompleteResponseSchema.safeParse({
        documentId: "doc-1",
        lifecycle: "UPLOADED",
      }).success,
    ).toBe(false);
    expect(
      deleteDocumentResponseSchema.safeParse({
        documentId: "doc-1",
        note: "deleted",
      }).success,
    ).toBe(false);
    expect(
      analyzeResponseSchema.safeParse({ documentId: "doc-1", jobId: UUID })
        .success,
    ).toBe(false);
    expect(documentListItemSchema.safeParse(validListItem()).success).toBe(
      true,
    );
  });

  it("rejects non-uuid jobId in analyzeResponseSchema", () => {
    expect(
      analyzeResponseSchema.safeParse({ documentId: UUID, jobId: "job-1" })
        .success,
    ).toBe(false);
  });

  it("rejects non-uuid analysisId in analysis responses", () => {
    expect(
      analysisResponseSchema.safeParse({
        state: "READY",
        analysisId: "a-1",
        version: 1,
        analysis: mockUtilityBillAnalysis,
      }).success,
    ).toBe(false);
    expect(
      analysisByIdResponseSchema.safeParse({
        analysisId: "a-1",
        documentId: UUID,
        version: 1,
        generatedAt: "2026-01-01T00:00:00.000Z",
        analysis: mockUtilityBillAnalysis,
      }).success,
    ).toBe(false);
  });
});

function validListItem() {
  return {
    documentId: UUID,
    title: "December electric bill",
    lifecycle: "AWAITING_UPLOAD",
    stage: "RECEIVED",
    category: null,
    nextDeadline: null,
    needsAttention: false,
    createdAt: "2026-11-13T00:00:00.000Z",
    analysisStatus: "NONE",
  };
}

describe("documentListItemSchema", () => {
  it("accepts a document awaiting upload with no category and no analysis", () => {
    expect(documentListItemSchema.safeParse(validListItem()).success).toBe(
      true,
    );
  });

  it("requires createdAt and analysisStatus", () => {
    const missingCreatedAt = validListItem();
    delete (missingCreatedAt as Record<string, unknown>).createdAt;
    expect(documentListItemSchema.safeParse(missingCreatedAt).success).toBe(
      false,
    );

    const missingStatus = validListItem();
    delete (missingStatus as Record<string, unknown>).analysisStatus;
    expect(documentListItemSchema.safeParse(missingStatus).success).toBe(false);
  });

  it("rejects an unknown analysisStatus value", () => {
    expect(
      documentListItemSchema.safeParse({
        ...validListItem(),
        analysisStatus: "DONE",
      }).success,
    ).toBe(false);
  });

  it("documentDetailResponseSchema inherits createdAt and analysisStatus without redefining them", () => {
    expect(
      documentDetailResponseSchema.safeParse({
        ...validListItem(),
        subtype: "Electric bill",
        mimeType: "application/pdf",
        fileSize: 12345,
        originalFilename: "bill.pdf",
        updatedAt: "2026-11-13T00:00:00.000Z",
        latestAnalysisId: null,
      }).success,
    ).toBe(true);
  });
});
