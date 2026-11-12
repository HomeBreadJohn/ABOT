import { describe, expect, it } from "vitest";
import {
  apiErrorSchema,
  API_ERROR_HTTP_STATUS,
  createDocumentRequestSchema,
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
      createDocumentRequestSchema.safeParse({ ...valid, mimeType: "text/plain" })
        .success,
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
  it("accepts READY with an analysis", () => {
    const parsed = analysisResponseSchema.safeParse({
      state: "READY",
      analysisId: "a-1",
      version: 1,
      analysis: mockUtilityBillAnalysis,
    });
    expect(parsed.success).toBe(true);
  });

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
    expect(sendMessageRequestSchema.safeParse({ content: "a".repeat(1000) }).success).toBe(true);
    expect(sendMessageRequestSchema.safeParse({ content: "a".repeat(1001) }).success).toBe(false);
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
