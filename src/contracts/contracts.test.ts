import { describe, expect, it } from "vitest";

import { employmentContractAnalysis, governmentNoticeAnalysis } from "@/mocks";

import {
  DOCUMENT_STATUSES,
  DOCUMENT_STATUS_TRANSITIONS,
  analysisResponseSchema,
  analysisResultSchema,
  canTransition,
  createReminderRequestSchema,
  type AnalysisResult,
} from ".";

const clone = (r: AnalysisResult): AnalysisResult => structuredClone(r);

function issuesFor(report: unknown) {
  const result = analysisResultSchema.safeParse(report);
  return result.success ? [] : result.error.issues.map((i) => i.message);
}

describe("analysisResultSchema integrity rules", () => {
  it("accepts a valid report", () => {
    expect(issuesFor(employmentContractAnalysis)).toEqual([]);
  });

  it("rejects a FOUND finding with no evidence", () => {
    const r = clone(employmentContractAnalysis);
    r.keyInformation[0].evidenceIds = [];
    expect(issuesFor(r)).toContain("FOUND findings must cite evidence");
  });

  it("rejects references to unknown evidence ids", () => {
    const r = clone(employmentContractAnalysis);
    r.obligations[0].evidenceIds = ["does-not-exist"];
    expect(issuesFor(r).join()).toContain("Unknown evidence id");
  });

  it("rejects duplicate ids", () => {
    const r = clone(employmentContractAnalysis);
    r.obligations[0].id = r.keyInformation[0].id;
    expect(issuesFor(r).join()).toContain("Duplicate id");
  });

  it("rejects an INFERRED consequence presented as FOUND", () => {
    const r = clone(employmentContractAnalysis);
    const inferred = r.consequences.find(
      (c) => c.consequenceType === "INFERRED",
    )!;
    inferred.informationStatus = "FOUND";
    expect(issuesFor(r)).toContain(
      "An INFERRED consequence cannot have status FOUND",
    );
  });

  it("rejects an EXPLICIT consequence marked INFERRED", () => {
    const r = clone(employmentContractAnalysis);
    const explicit = r.consequences.find(
      (c) => c.consequenceType === "EXPLICIT",
    )!;
    explicit.informationStatus = "INFERRED";
    expect(issuesFor(r)).toContain(
      "An EXPLICIT consequence cannot have status INFERRED",
    );
  });

  it("rejects evidence that cites an unavailable page", () => {
    const r = clone(governmentNoticeAnalysis);
    r.evidence[0].pageNumber = 3;
    expect(issuesFor(r)).toContain("Evidence cannot cite an unavailable page");
  });

  it("rejects evidence beyond the page count", () => {
    const r = clone(employmentContractAnalysis);
    r.evidence[0].pageNumber = 99;
    expect(issuesFor(r)).toContain("Evidence page is beyond totalPages");
  });

  it("rejects inconsistent partial metadata", () => {
    const r = clone(governmentNoticeAnalysis);
    r.analysisMetadata.isPartial = false;
    expect(issuesFor(r)).toContain(
      "isPartial must be true exactly when pages are unavailable",
    );
  });

  it("requires limitations when the analysis is partial", () => {
    const r = clone(governmentNoticeAnalysis);
    r.limitations = [];
    expect(issuesFor(r)).toContain(
      "A partial analysis must disclose its limitations",
    );
  });

  it("rejects a wrong schema version", () => {
    const r = { ...clone(employmentContractAnalysis), schemaVersion: "9.9.9" };
    expect(issuesFor(r).length).toBeGreaterThan(0);
  });
});

describe("analysisResponseSchema", () => {
  const base = {
    id: "5d6e7f80-1a2b-4c3d-8e4f-5a6b7c8d9e11",
    documentId: "3f1c2a64-8b1e-4c57-9d3a-2a7e5b9c1d01",
    version: 1,
    createdAt: "2026-11-15T09:30:00+08:00",
    completedAt: null,
    failureReason: null,
  };

  it("never lets a failed analysis carry a report", () => {
    const result = analysisResponseSchema.safeParse({
      ...base,
      status: "FAILED",
      report: employmentContractAnalysis,
    });
    expect(result.success).toBe(false);
  });

  it("never lets a completed analysis omit its report", () => {
    const result = analysisResponseSchema.safeParse({
      ...base,
      status: "COMPLETED",
      report: null,
    });
    expect(result.success).toBe(false);
  });
});

describe("document lifecycle", () => {
  it("defines transitions for every status", () => {
    for (const status of DOCUMENT_STATUSES) {
      expect(DOCUMENT_STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });

  it("only reaches COMPLETED through analysis or review", () => {
    const sources = DOCUMENT_STATUSES.filter((s) =>
      canTransition(s, "COMPLETED"),
    );
    expect(sources.sort()).toEqual(["ANALYZING", "REVIEW_REQUIRED"]);
  });

  it("allows retry from failures but never straight to completion", () => {
    expect(canTransition("OCR_FAILED", "OCR_PROCESSING")).toBe(true);
    expect(canTransition("ANALYSIS_FAILED", "ANALYZING")).toBe(true);
    expect(canTransition("ANALYSIS_FAILED", "COMPLETED")).toBe(false);
    expect(canTransition("OCR_FAILED", "ANALYZING")).toBe(false);
  });
});

describe("createReminderRequestSchema", () => {
  const valid = {
    documentId: null,
    title: "Pay bill",
    description: null,
    dueAt: "2026-11-20T17:00:00+08:00",
    reminderAt: "2026-11-18T09:00:00+08:00",
  };

  it("accepts a reminder before the due date", () => {
    expect(createReminderRequestSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects a reminder after the due date", () => {
    const result = createReminderRequestSchema.safeParse({
      ...valid,
      reminderAt: "2026-11-21T09:00:00+08:00",
    });
    expect(result.success).toBe(false);
  });
});
