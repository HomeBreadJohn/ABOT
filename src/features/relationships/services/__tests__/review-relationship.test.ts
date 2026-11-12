import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import {
  reviewRelationship,
  type ReviewRelationshipDeps,
} from "@/features/relationships/services/review-relationship";

const OWNER = "11111111-1111-1111-1111-111111111111";
const STRANGER = "99999999-9999-9999-9999-999999999999";
const REL = "3f2504e0-4f89-11d3-9a0c-0305e82c3309";
const DOC_A = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";
const DOC_B = "3f2504e0-4f89-11d3-9a0c-0305e82c3302";

function makeDeps(overrides: Partial<ReviewRelationshipDeps> = {}): ReviewRelationshipDeps {
  return {
    loadRelationship: vi.fn(async () => ({
      sourceDocumentId: DOC_A,
      targetDocumentId: DOC_B,
    })),
    authorize: vi.fn(async () => true),
    setApproval: vi.fn(async (_id, _status, type) => type ?? "POSSIBLE_MATCH"),
    ...overrides,
  };
}

describe("reviewRelationship", () => {
  it("APPROVE sets CONFIRMED_MATCH", async () => {
    const deps = makeDeps();

    const result = await reviewRelationship(OWNER, REL, "APPROVE", deps);

    expect(result.type).toBe("CONFIRMED_MATCH");
    expect(deps.setApproval).toHaveBeenCalledWith(REL, "APPROVED", "CONFIRMED_MATCH");
  });

  it("REJECT stores REJECTED and keeps the type as POSSIBLE_MATCH", async () => {
    const deps = makeDeps();

    const result = await reviewRelationship(OWNER, REL, "REJECT", deps);

    expect(result.type).toBe("POSSIBLE_MATCH");
    expect(deps.setApproval).toHaveBeenCalledWith(REL, "REJECTED", undefined);
  });

  it("returns NOT_FOUND for a missing relationship", async () => {
    const deps = makeDeps({ loadRelationship: vi.fn(async () => null) });

    const err = await reviewRelationship(OWNER, REL, "APPROVE", deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.setApproval).not.toHaveBeenCalled();
  });

  it("returns NOT_FOUND when a document in the pair is not owned or shared", async () => {
    const deps = makeDeps({
      authorize: vi.fn(async (_userId, documentId) => documentId === DOC_A),
    });

    const err = await reviewRelationship(STRANGER, REL, "APPROVE", deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.setApproval).not.toHaveBeenCalled();
  });
});
