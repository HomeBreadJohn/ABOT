import { describe, expect, it } from "vitest";

import {
  DOCUMENT_STATUSES,
  analysisResultSchema,
  analysisTranslationSchema,
  conversationSchema,
  documentSummarySchema,
  messageSchema,
  reminderSchema,
} from "@/contracts";

import {
  employmentContractAnalysis,
  employmentContractFilipino,
  governmentNoticeAnalysis,
  mockAnalysesByDocumentId,
  mockConversation,
  mockDocuments,
  mockMessages,
  mockReminders,
  utilityBillAnalysis,
} from ".";

const reports = [
  ["employment contract", employmentContractAnalysis],
  ["utility bill", utilityBillAnalysis],
  ["government notice", governmentNoticeAnalysis],
] as const;

describe.each(reports)("%s fixture", (_name, report) => {
  it("matches the analysis contract", () => {
    const result = analysisResultSchema.safeParse(report);
    expect(result.success, JSON.stringify(result.error?.issues)).toBe(true);
  });
});

describe("fixture coverage", () => {
  const all = reports.map(([, r]) => r);
  const findings = all.flatMap((r) => [
    ...r.keyInformation,
    ...r.obligations,
    ...r.watchouts,
    ...r.consequences,
    ...r.nextSteps,
    ...r.importantDates,
    ...r.specializedSections.flatMap((s) => s.items),
  ]);

  it("exercises every information status", () => {
    const statuses = new Set(findings.map((f) => f.informationStatus));
    expect([...statuses].sort()).toEqual(
      ["CONFLICTING", "FOUND", "INFERRED", "NOT_FOUND", "UNCLEAR"].sort(),
    );
  });

  it("exercises every severity", () => {
    const severities = new Set(
      all.flatMap((r) => r.watchouts.map((w) => w.severity)),
    );
    expect([...severities].sort()).toEqual([
      "CRITICAL",
      "HIGH",
      "LOW",
      "MEDIUM",
    ]);
  });

  it("includes explicit and inferred consequences", () => {
    const types = new Set(
      all.flatMap((r) => r.consequences.map((c) => c.consequenceType)),
    );
    expect([...types].sort()).toEqual(["EXPLICIT", "INFERRED"]);
  });

  it("includes a partial report and a required review", () => {
    expect(all.some((r) => r.analysisMetadata.isPartial)).toBe(true);
    expect(
      all.some((r) => r.reviewRequirements.some((x) => x.level === "REQUIRED")),
    ).toBe(true);
  });

  it("uses different specialized sections per category", () => {
    const keys = reports.map(([, r]) =>
      r.specializedSections.map((s) => s.sectionKey).join(","),
    );
    expect(new Set(keys).size).toBe(3);
  });
});

describe("document list fixtures", () => {
  it("match the document summary contract", () => {
    for (const doc of mockDocuments) {
      const result = documentSummarySchema.safeParse(doc);
      expect(
        result.success,
        `${doc.title}: ${JSON.stringify(result.error?.issues)}`,
      ).toBe(true);
    }
  });

  it("cover every lifecycle status", () => {
    const covered = new Set(mockDocuments.map((d) => d.processingStatus));
    for (const status of DOCUMENT_STATUSES) {
      expect(covered.has(status), `missing ${status}`).toBe(true);
    }
  });

  it("have unique ids", () => {
    const ids = mockDocuments.map((d) => d.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("only allow retry for failed or partial states", () => {
    for (const doc of mockDocuments.filter((d) => d.canRetry)) {
      expect(["OCR_FAILED", "OCR_PARTIAL", "ANALYSIS_FAILED"]).toContain(
        doc.processingStatus,
      );
    }
  });

  it("report fixtures reference their own document", () => {
    for (const [documentId, report] of Object.entries(
      mockAnalysesByDocumentId,
    )) {
      expect(report.evidence.every((e) => e.documentId === documentId)).toBe(
        true,
      );
    }
  });
});

describe("other fixtures", () => {
  it("reminders match the contract", () => {
    for (const r of mockReminders) {
      expect(reminderSchema.safeParse(r).success).toBe(true);
    }
  });

  it("conversation and messages match the contract", () => {
    expect(conversationSchema.safeParse(mockConversation).success).toBe(true);
    for (const m of mockMessages) {
      expect(messageSchema.safeParse(m).success).toBe(true);
    }
  });

  it("chat citations point at real evidence", () => {
    const ids = new Set(employmentContractAnalysis.evidence.map((e) => e.id));
    for (const m of mockMessages) {
      for (const c of m.citations) expect(ids.has(c.id)).toBe(true);
    }
  });

  it("translation matches the contract and only targets known ids", () => {
    expect(
      analysisTranslationSchema.safeParse(employmentContractFilipino).success,
    ).toBe(true);
    const r = employmentContractAnalysis;
    const known = new Set([
      ...r.keyInformation.map((x) => x.id),
      ...r.obligations.map((x) => x.id),
      ...r.watchouts.map((x) => x.id),
      ...r.consequences.map((x) => x.id),
      ...r.nextSteps.map((x) => x.id),
      ...r.importantDates.map((x) => x.id),
      ...r.specializedSections.flatMap((s) => [
        s.id,
        ...s.items.map((i) => i.id),
      ]),
    ]);
    for (const id of Object.keys(employmentContractFilipino.items)) {
      expect(known.has(id), id).toBe(true);
    }
  });
});
