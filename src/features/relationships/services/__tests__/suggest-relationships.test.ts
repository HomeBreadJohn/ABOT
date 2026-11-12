import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import {
  suggestRelationships,
  type DocumentIntelligence,
  type SuggestRelationshipsDeps,
} from "@/features/relationships/services/suggest-relationships";

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "99999999-9999-9999-9999-999999999999";
const DOC_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const DOC_B = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

/** Extracted identifiers plus matching evidence IDs for one document. */
function intel(overrides: Partial<DocumentIntelligence> = {}): DocumentIntelligence {
  return {
    issuer: "Sample Electric Cooperative",
    accountNumbers: ["ACC-12345"],
    referenceNumbers: [],
    amounts: ["2450.00"],
    dates: ["2026-12-15"],
    // Evidence IDs keyed by the identifier they support.
    evidenceByValue: {
      "Sample Electric Cooperative": ["ev-a-issuer"],
      "ACC-12345": ["ev-a-acct"],
      "2450.00": ["ev-a-amount"],
      "2026-12-15": ["ev-a-date"],
    },
    ...overrides,
  };
}

function makeDeps(overrides: Partial<SuggestRelationshipsDeps> = {}): SuggestRelationshipsDeps {
  const persisted: Array<{
    id: string;
    source: string;
    target: string;
    type: string;
    confidence: number;
  }> = [];
  return {
    authorize: vi.fn(async () => true),
    loadIntelligence: vi.fn(async (documentId: string) =>
      documentId === DOC_A
        ? intel()
        : intel({
            evidenceByValue: {
              "Sample Electric Cooperative": ["ev-b-issuer"],
              "ACC-12345": ["ev-b-acct"],
              "2450.00": ["ev-b-amount"],
              "2026-12-15": ["ev-b-date"],
            },
          }),
    ),
    rejectedPairExists: vi.fn(async () => false),
    persist: vi.fn(async (input) => {
      const id = `rel-${persisted.length + 1}`;
      persisted.push({ id, ...input });
      return id;
    }),
    newId: () => "sugg-1",
    _persisted: persisted,
    ...overrides,
  } as SuggestRelationshipsDeps & {
    _persisted: typeof persisted;
  };
}

describe("suggestRelationships", () => {
  it("suggests a POSSIBLE_MATCH from a deterministic identifier match", async () => {
    const deps = makeDeps();

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    expect(result.suggestions).toHaveLength(1);
    const s = result.suggestions[0];
    expect(s.type).toBe("POSSIBLE_MATCH");
    expect(s.documentIdA).toBe(DOC_A);
    expect(s.documentIdB).toBe(DOC_B);
    // issuer + account number + date all match → confident, but never 1.
    expect(s.confidence).toBeGreaterThan(0.3);
    expect(s.confidence).toBeLessThanOrEqual(1);
  });

  it("confidence is at most 0.3 when only the amount matches", async () => {
    const deps = makeDeps({
      loadIntelligence: vi.fn(async (documentId: string) =>
        documentId === DOC_A
          ? intel({
              issuer: "Alpha Bank",
              accountNumbers: [],
              referenceNumbers: [],
              dates: [],
              amounts: ["2450.00"],
              evidenceByValue: { "2450.00": ["ev-a-amount"] },
            })
          : intel({
              issuer: "Beta Utility",
              accountNumbers: [],
              referenceNumbers: [],
              dates: [],
              amounts: ["2450.00"],
              evidenceByValue: { "2450.00": ["ev-b-amount"] },
            }),
      ),
    });

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0].confidence).toBeLessThanOrEqual(0.3);
    expect(result.suggestions[0].type).toBe("POSSIBLE_MATCH");
  });

  it("never emits CONFIRMED_MATCH even on a strong match", async () => {
    const deps = makeDeps();
    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);
    expect(result.suggestions.every((s) => s.type === "POSSIBLE_MATCH")).toBe(true);
  });

  it("stores the matching evidence IDs from both documents", async () => {
    const deps = makeDeps();

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    const ids = result.suggestions[0].matchingEvidenceIds;
    // Both docs contribute evidence for the shared issuer, account, and date.
    expect(ids).toContain("ev-a-issuer");
    expect(ids).toContain("ev-b-issuer");
    expect(ids).toContain("ev-a-acct");
    expect(ids).toContain("ev-b-acct");
  });

  it("does not re-suggest a pair with a stored REJECTED relationship", async () => {
    const deps = makeDeps({ rejectedPairExists: vi.fn(async () => true) });

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    expect(result.suggestions).toHaveLength(0);
    expect(deps.persist).not.toHaveBeenCalled();
  });

  it("returns no suggestion when nothing matches", async () => {
    const deps = makeDeps({
      loadIntelligence: vi.fn(async (documentId: string) =>
        documentId === DOC_A
          ? intel({
              issuer: "Alpha Bank",
              accountNumbers: ["A-1"],
              referenceNumbers: [],
              amounts: ["100.00"],
              dates: ["2026-01-01"],
              evidenceByValue: {},
            })
          : intel({
              issuer: "Beta Utility",
              accountNumbers: ["B-2"],
              referenceNumbers: [],
              amounts: ["200.00"],
              dates: ["2026-06-01"],
              evidenceByValue: {},
            }),
      ),
    });

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    expect(result.suggestions).toHaveLength(0);
  });

  it("returns NOT_FOUND when a document is not owned or shared", async () => {
    const deps = makeDeps({
      authorize: vi.fn(async (_userId, documentId) => documentId === DOC_A),
    });

    const err = await suggestRelationships(STRANGER, DOC_A, DOC_B, deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.loadIntelligence).not.toHaveBeenCalled();
  });

  it("treats dates more than 60 days apart as non-matching", async () => {
    const deps = makeDeps({
      loadIntelligence: vi.fn(async (documentId: string) =>
        documentId === DOC_A
          ? intel({
              issuer: "Alpha Bank",
              accountNumbers: [],
              referenceNumbers: [],
              amounts: [],
              dates: ["2026-01-01"],
              evidenceByValue: { "2026-01-01": ["ev-a-date"] },
            })
          : intel({
              issuer: "Beta Utility",
              accountNumbers: [],
              referenceNumbers: [],
              amounts: [],
              dates: ["2026-12-01"],
              evidenceByValue: { "2026-12-01": ["ev-b-date"] },
            }),
      ),
    });

    const result = await suggestRelationships(OWNER, DOC_A, DOC_B, deps);

    expect(result.suggestions).toHaveLength(0);
  });
});
