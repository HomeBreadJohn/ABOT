import { describe, expect, it, vi } from "vitest";

import { AppError } from "@/lib/http/app-error";
import {
  listCorrections,
  type ListCorrectionsDeps,
} from "@/features/corrections/services/list-corrections";

const OWNER = "11111111-1111-1111-1111-111111111111";
const RECIPIENT = "22222222-2222-2222-2222-222222222222";
const DOC = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "c-1",
    page_number: 1,
    word_start: 3,
    word_end: 3,
    original_value: "1,250.00",
    corrected_value: "1,260.00",
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeDeps(overrides: Partial<ListCorrectionsDeps> = {}): ListCorrectionsDeps {
  return {
    loadDocumentOwner: vi.fn(async () => OWNER),
    loadCorrections: vi.fn(async () => [row()]),
    ...overrides,
  };
}

describe("listCorrections", () => {
  it("returns the full history including superseded and current rows", async () => {
    const deps = makeDeps({
      loadCorrections: vi.fn(async () => [
        row({ id: "c-1", corrected_value: "1,260.00", created_at: "2026-01-01T00:00:00.000Z" }),
        row({ id: "c-2", corrected_value: "1,275.00", created_at: "2026-01-02T00:00:00.000Z" }),
      ]),
    });

    const result = await listCorrections(OWNER, DOC, deps);

    expect(result.corrections).toHaveLength(2);
    expect(result.corrections.map((c) => c.id)).toEqual(["c-1", "c-2"]);
  });

  it("maps a null corrected_value (UNREADABLE) to null in the response", async () => {
    const deps = makeDeps({
      loadCorrections: vi.fn(async () => [row({ corrected_value: null })]),
    });

    const result = await listCorrections(OWNER, DOC, deps);

    expect(result.corrections[0].correctedValue).toBeNull();
  });

  it("a recipient (non-owner) gets NOT_FOUND", async () => {
    const deps = makeDeps();

    const err = await listCorrections(RECIPIENT, DOC, deps).catch((e) => e);

    expect(err).toBeInstanceOf(AppError);
    expect(err.code).toBe("NOT_FOUND");
    expect(deps.loadCorrections).not.toHaveBeenCalled();
  });
});
