import { describe, expect, it, vi } from "vitest";

import {
  documentDetailResponseSchema,
  documentListResponseSchema,
  documentPageResponseSchema,
  analysisResponseSchema,
  analysisByIdResponseSchema,
  mockUtilityBillAnalysis,
} from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import {
  getAnalysis,
  getAnalysisById,
  getDocument,
  getPage,
  listDocuments,
  updateDocument,
  type DocumentQueryDeps,
  type UpdateDocumentDeps,
} from "@/features/documents/services/document-queries";

const USER_ID = "11111111-1111-1111-1111-111111111111";
const DOC_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const DOC_ID_2 = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";
const DOC_ID_3 = "3f2504e0-4f89-11d3-9a0c-0305e82c3303";
const ANALYSIS_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3401";

function docRow(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC_ID,
    user_id: USER_ID,
    title: null,
    original_filename: "bill.pdf",
    processing_status: "COMPLETED",
    category: "UTILITIES",
    subtype: null,
    mime_type: "application/pdf",
    file_size: 1234,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-02T00:00:00.000Z",
    ...overrides,
  };
}

describe("listDocuments", () => {
  it("sorts needs-attention first, then nearest deadline, then newest", async () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const deps: DocumentQueryDeps = {
      now: () => now,
      listRows: vi.fn(async () => [
        // Plain COMPLETED, old, no deadline -> last.
        docRow({
          id: DOC_ID_3,
          processing_status: "COMPLETED",
          created_at: "2026-01-01T00:00:00.000Z",
        }),
        // Plain COMPLETED, newer, no deadline -> middle.
        docRow({
          id: DOC_ID_2,
          processing_status: "COMPLETED",
          created_at: "2026-05-01T00:00:00.000Z",
        }),
        // Needs attention (lifecycle) -> first.
        docRow({
          id: DOC_ID,
          processing_status: "ANALYSIS_FAILED",
          created_at: "2026-02-01T00:00:00.000Z",
        }),
      ]),
      latestAnalysisStatus: vi.fn(async () => "NONE" as const),
      nextDeadline: vi.fn(async () => null),
    };

    const result = await listDocuments(USER_ID, deps);

    expect(documentListResponseSchema.parse(result)).toEqual(result);
    expect(result.documents.map((d) => d.documentId)).toEqual([
      DOC_ID,
      DOC_ID_2,
      DOC_ID_3,
    ]);
  });

  it("treats a deadline within 7 days as needs-attention and sorts by nearest deadline", async () => {
    const now = new Date("2026-06-01T00:00:00.000Z");
    const soon = "2026-06-03T00:00:00.000Z"; // within 7 days
    const later = "2026-06-05T00:00:00.000Z"; // within 7 days but further
    const far = "2026-12-01T00:00:00.000Z"; // not within 7 days

    const deadlines: Record<string, string | null> = {
      [DOC_ID]: later,
      [DOC_ID_2]: soon,
      [DOC_ID_3]: far,
    };

    const deps: DocumentQueryDeps = {
      now: () => now,
      listRows: vi.fn(async () => [
        docRow({ id: DOC_ID, processing_status: "COMPLETED" }),
        docRow({ id: DOC_ID_2, processing_status: "COMPLETED" }),
        docRow({ id: DOC_ID_3, processing_status: "COMPLETED" }),
      ]),
      latestAnalysisStatus: vi.fn(async () => "SUCCEEDED" as const),
      nextDeadline: vi.fn(async (_u, id) => deadlines[id] ?? null),
    };

    const result = await listDocuments(USER_ID, deps);
    const ids = result.documents.map((d) => d.documentId);
    const attention = Object.fromEntries(
      result.documents.map((d) => [d.documentId, d.needsAttention]),
    );

    // DOC_ID_2 (soon) and DOC_ID (later) are within 7 days -> attention, nearest first.
    expect(ids).toEqual([DOC_ID_2, DOC_ID, DOC_ID_3]);
    expect(attention[DOC_ID_2]).toBe(true);
    expect(attention[DOC_ID]).toBe(true);
    expect(attention[DOC_ID_3]).toBe(false);
  });

  it("reports analysisStatus from the latest analysis row", async () => {
    const deps: DocumentQueryDeps = {
      now: () => new Date("2026-06-01T00:00:00.000Z"),
      listRows: vi.fn(async () => [docRow()]),
      latestAnalysisStatus: vi.fn(async () => "SUCCEEDED" as const),
      nextDeadline: vi.fn(async () => null),
    };

    const result = await listDocuments(USER_ID, deps);
    expect(result.documents[0].analysisStatus).toBe("SUCCEEDED");
    expect(result.documents[0].title).toBe("bill.pdf");
  });
});

describe("getDocument", () => {
  it("returns detail validated against the contract", async () => {
    const deps: DocumentQueryDeps = {
      getRow: vi.fn(async () => docRow()),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "SUCCEEDED",
      })),
    };

    const result = await getDocument(USER_ID, DOC_ID, deps);
    expect(documentDetailResponseSchema.parse(result)).toEqual(result);
    expect(result.latestAnalysisId).toBe(ANALYSIS_ID);
  });

  it("throws NOT_FOUND when the row is missing or another user's", async () => {
    const deps: DocumentQueryDeps = {
      getRow: vi.fn(async () => null),
      latestAnalysisRow: vi.fn(async () => null),
    };
    const err = await getDocument(USER_ID, DOC_ID, deps).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("getAnalysis", () => {
  const report = () => ({
    ...mockUtilityBillAnalysis,
    document: { ...mockUtilityBillAnalysis.document, documentId: DOC_ID },
    evidence: mockUtilityBillAnalysis.evidence.map((e) => ({
      ...e,
      documentId: DOC_ID,
    })),
  });

  it("returns READY from the latest SUCCEEDED analysis", async () => {
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "COMPLETED" })),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "SUCCEEDED",
        version: 1,
        report_json: report(),
      })),
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, undefined, deps);
    expect(analysisResponseSchema.parse(result)).toEqual(result);
    expect(result.state).toBe("READY");
  });

  it("never returns a RUNNING analysis row as READY", async () => {
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "ANALYZING" })),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "RUNNING",
        version: 1,
        report_json: report(),
      })),
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, undefined, deps);
    expect(result.state).toBe("PROCESSING");
    if (result.state === "PROCESSING") expect(result.stage).toBe("UNDERSTANDING");
  });

  it("never returns a FAILED analysis row as READY", async () => {
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () =>
        docRow({ processing_status: "ANALYSIS_FAILED" }),
      ),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "FAILED",
        version: 1,
        report_json: report(),
      })),
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, undefined, deps);
    expect(result.state).toBe("FAILED");
    if (result.state === "FAILED") expect(result.errorCode).toBe("INVALID_ANALYSIS");
  });

  it("kicks the runner when a queued job is older than 2 minutes", async () => {
    const kick = vi.fn();
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "ANALYZING" })),
      latestAnalysisRow: vi.fn(async () => null),
      oldestQueuedJobAge: vi.fn(async () => 3 * 60_000),
      kick,
    };

    await getAnalysis(USER_ID, DOC_ID, undefined, deps, "https://app.test");
    expect(kick).toHaveBeenCalledWith("https://app.test");
  });

  it("does not kick when the queued job is fresh", async () => {
    const kick = vi.fn();
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "ANALYZING" })),
      latestAnalysisRow: vi.fn(async () => null),
      oldestQueuedJobAge: vi.fn(async () => 10_000),
      kick,
    };

    await getAnalysis(USER_ID, DOC_ID, undefined, deps, "https://app.test");
    expect(kick).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for another user's document", async () => {
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => null),
      latestAnalysisRow: vi.fn(async () => null),
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };
    const err = await getAnalysis(USER_ID, DOC_ID, undefined, deps).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });

  it("returns the original immediately with translationPending and enqueues TRANSLATE for an uncached non-source language", async () => {
    const enqueueTranslate = vi.fn(async () => {});
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "COMPLETED" })),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "SUCCEEDED",
        version: 1,
        report_json: report(),
      })),
      loadTranslation: vi.fn(async () => null),
      enqueueTranslate,
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, "FIL", deps);
    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      expect(result.translationPending).toBe(true);
      // Original (untranslated) report is returned unchanged.
      expect(result.analysis.overview).toBe(report().overview);
    }
    expect(enqueueTranslate).toHaveBeenCalledWith(USER_ID, DOC_ID, ANALYSIS_ID, "FIL");
    // No OCR or re-analysis job is enqueued — only TRANSLATE.
    expect(analysisResponseSchema.parse(result)).toEqual(result);
  });

  it("returns the cached translation as READY without enqueuing", async () => {
    const translated = {
      ...report(),
      overview: "ISANG NAKASALIN NA OVERVIEW",
    };
    const enqueueTranslate = vi.fn(async () => {});
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "COMPLETED" })),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "SUCCEEDED",
        version: 1,
        report_json: report(),
      })),
      loadTranslation: vi.fn(async () => translated),
      enqueueTranslate,
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, "FIL", deps);
    expect(result.state).toBe("READY");
    if (result.state === "READY") {
      expect(result.analysis.overview).toBe("ISANG NAKASALIN NA OVERVIEW");
      expect(result.translationPending).toBeUndefined();
    }
    expect(enqueueTranslate).not.toHaveBeenCalled();
  });

  it("never enqueues a translation for EN (the source language)", async () => {
    const enqueueTranslate = vi.fn(async () => {});
    const deps: DocumentQueryDeps = {
      now: () => new Date(),
      getRow: vi.fn(async () => docRow({ processing_status: "COMPLETED" })),
      latestAnalysisRow: vi.fn(async () => ({
        id: ANALYSIS_ID,
        status: "SUCCEEDED",
        version: 1,
        report_json: report(),
      })),
      loadTranslation: vi.fn(async () => null),
      enqueueTranslate,
      oldestQueuedJobAge: vi.fn(async () => null),
      kick: vi.fn(),
    };

    const result = await getAnalysis(USER_ID, DOC_ID, "EN", deps);
    expect(result.state).toBe("READY");
    if (result.state === "READY")
      expect(result.translationPending).toBeUndefined();
    expect(enqueueTranslate).not.toHaveBeenCalled();
  });
});

describe("getAnalysisById", () => {
  it("returns the specific version validated against its contract", async () => {
    const report = {
      ...mockUtilityBillAnalysis,
      document: { ...mockUtilityBillAnalysis.document, documentId: DOC_ID },
      evidence: mockUtilityBillAnalysis.evidence.map((e) => ({
        ...e,
        documentId: DOC_ID,
      })),
    };
    const deps: DocumentQueryDeps = {
      analysisById: vi.fn(async () => ({
        id: ANALYSIS_ID,
        document_id: DOC_ID,
        version: 1,
        status: "SUCCEEDED",
        completed_at: "2026-01-02T00:00:00.000Z",
        report_json: report,
      })),
    };

    const result = await getAnalysisById(USER_ID, ANALYSIS_ID, deps);
    expect(analysisByIdResponseSchema.parse(result)).toEqual(result);
  });

  it("throws NOT_FOUND when the analysis is missing or not SUCCEEDED", async () => {
    const deps: DocumentQueryDeps = {
      analysisById: vi.fn(async () => null),
    };
    const err = await getAnalysisById(USER_ID, ANALYSIS_ID, deps).catch(
      (e) => e,
    );
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("updateDocument", () => {
  it("updates the title and returns the fresh detail", async () => {
    const applied: Record<string, unknown>[] = [];
    const deps: UpdateDocumentDeps = {
      loadOwned: vi.fn(async () => ({
        processing_status: "COMPLETED",
        category: "UTILITIES",
      })),
      applyUpdate: vi.fn(async (_u, _d, patch) => {
        applied.push(patch);
      }),
      reload: vi.fn(async () =>
        documentDetailResponseSchema.parse({
          documentId: DOC_ID,
          title: "Renamed",
          lifecycle: "COMPLETED",
          stage: "PREPARING_REPORT",
          category: "UTILITIES",
          analysisStatus: "SUCCEEDED",
          nextDeadline: null,
          needsAttention: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          subtype: null,
          mimeType: "application/pdf",
          fileSize: 10,
          originalFilename: "bill.pdf",
          updatedAt: "2026-01-02T00:00:00.000Z",
          latestAnalysisId: null,
        }),
      ),
      enqueueReanalyze: vi.fn(async () => {}),
      kick: vi.fn(),
    };

    const result = await updateDocument(
      USER_ID,
      DOC_ID,
      { title: "Renamed" },
      "https://app.test",
      deps,
    );

    expect(result.title).toBe("Renamed");
    expect(applied).toEqual([{ title: "Renamed" }]);
    expect(deps.enqueueReanalyze).not.toHaveBeenCalled();
  });

  it("enqueues REANALYZE when a category change on COMPLETED differs by modules", async () => {
    const deps: UpdateDocumentDeps = {
      loadOwned: vi.fn(async () => ({
        processing_status: "COMPLETED",
        category: "UTILITIES",
      })),
      applyUpdate: vi.fn(async () => {}),
      reload: vi.fn(async () =>
        documentDetailResponseSchema.parse({
          documentId: DOC_ID,
          title: "bill.pdf",
          lifecycle: "COMPLETED",
          stage: "PREPARING_REPORT",
          category: "FINANCIAL",
          analysisStatus: "SUCCEEDED",
          nextDeadline: null,
          needsAttention: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          subtype: null,
          mimeType: "application/pdf",
          fileSize: 10,
          originalFilename: "bill.pdf",
          updatedAt: "2026-01-02T00:00:00.000Z",
          latestAnalysisId: null,
        }),
      ),
      enqueueReanalyze: vi.fn(async () => {}),
      kick: vi.fn(),
    };

    await updateDocument(
      USER_ID,
      DOC_ID,
      { category: "FINANCIAL" },
      "https://app.test",
      deps,
    );

    expect(deps.enqueueReanalyze).toHaveBeenCalledWith(
      USER_ID,
      DOC_ID,
      "FINANCIAL",
    );
    expect(deps.kick).toHaveBeenCalledWith("https://app.test");
  });

  it("does not reanalyze when the category is unchanged", async () => {
    const deps: UpdateDocumentDeps = {
      loadOwned: vi.fn(async () => ({
        processing_status: "COMPLETED",
        category: "UTILITIES",
      })),
      applyUpdate: vi.fn(async () => {}),
      reload: vi.fn(async () =>
        documentDetailResponseSchema.parse({
          documentId: DOC_ID,
          title: "bill.pdf",
          lifecycle: "COMPLETED",
          stage: "PREPARING_REPORT",
          category: "UTILITIES",
          analysisStatus: "SUCCEEDED",
          nextDeadline: null,
          needsAttention: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          subtype: null,
          mimeType: "application/pdf",
          fileSize: 10,
          originalFilename: "bill.pdf",
          updatedAt: "2026-01-02T00:00:00.000Z",
          latestAnalysisId: null,
        }),
      ),
      enqueueReanalyze: vi.fn(async () => {}),
      kick: vi.fn(),
    };

    await updateDocument(
      USER_ID,
      DOC_ID,
      { category: "UTILITIES" },
      "https://app.test",
      deps,
    );

    expect(deps.enqueueReanalyze).not.toHaveBeenCalled();
  });

  it("does not reanalyze a category change on a non-COMPLETED document", async () => {
    const deps: UpdateDocumentDeps = {
      loadOwned: vi.fn(async () => ({
        processing_status: "OCR_READY",
        category: "UTILITIES",
      })),
      applyUpdate: vi.fn(async () => {}),
      reload: vi.fn(async () =>
        documentDetailResponseSchema.parse({
          documentId: DOC_ID,
          title: "bill.pdf",
          lifecycle: "OCR_READY",
          stage: "READING",
          category: "FINANCIAL",
          analysisStatus: "NONE",
          nextDeadline: null,
          needsAttention: false,
          createdAt: "2026-01-01T00:00:00.000Z",
          subtype: null,
          mimeType: "application/pdf",
          fileSize: 10,
          originalFilename: "bill.pdf",
          updatedAt: "2026-01-02T00:00:00.000Z",
          latestAnalysisId: null,
        }),
      ),
      enqueueReanalyze: vi.fn(async () => {}),
      kick: vi.fn(),
    };

    await updateDocument(
      USER_ID,
      DOC_ID,
      { category: "FINANCIAL" },
      "https://app.test",
      deps,
    );

    expect(deps.enqueueReanalyze).not.toHaveBeenCalled();
  });

  it("throws NOT_FOUND for another user's document", async () => {
    const deps: UpdateDocumentDeps = {
      loadOwned: vi.fn(async () => null),
      applyUpdate: vi.fn(async () => {}),
      reload: vi.fn(),
      enqueueReanalyze: vi.fn(async () => {}),
      kick: vi.fn(),
    };

    const err = await updateDocument(
      USER_ID,
      DOC_ID,
      { title: "x" },
      "https://app.test",
      deps,
    ).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});

describe("getPage", () => {
  it("returns page text and words for the owner or recipient", async () => {
    const deps: DocumentQueryDeps = {
      getPageRow: vi.fn(async () => ({
        page_number: 1,
        ocr_status: "READY",
        extracted_text: "Amount Due 1500",
        average_confidence: 0.9,
        page_metadata: {
          words: [{ index: 0, text: "Amount", confidence: 0.9 }],
        },
      })),
    };

    const result = await getPage(USER_ID, DOC_ID, 1, deps);
    expect(documentPageResponseSchema.parse(result)).toEqual(result);
    expect(result.words).toHaveLength(1);
  });

  it("throws NOT_FOUND when the page is not visible to the user", async () => {
    const deps: DocumentQueryDeps = {
      getPageRow: vi.fn(async () => null),
    };
    const err = await getPage(USER_ID, DOC_ID, 1, deps).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
  });
});
