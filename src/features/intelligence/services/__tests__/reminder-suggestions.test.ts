import { describe, expect, it } from "vitest";

import { mockUtilityBillAnalysis, reminderSuggestionSchema } from "@/contracts";
import type { AnalysisResult } from "@/contracts";
import { suggestReminders } from "@/features/intelligence/services/reminder-suggestions";

const NOW = new Date("2026-06-01T00:00:00.000Z");

type ImportantDate = AnalysisResult["importantDates"][number];

function importantDate(overrides: Partial<ImportantDate> = {}): ImportantDate {
  return {
    id: "date-1",
    title: "Payment due",
    explanation: "The bill must be paid by this date.",
    informationStatus: "FOUND",
    confidence: 0.9,
    basis: "Stated on the bill.",
    evidenceIds: [],
    date: "2026-06-20T00:00:00.000Z",
    dateText: "June 20, 2026",
    ...overrides,
  };
}

function result(dates: ImportantDate[]): AnalysisResult {
  return { ...mockUtilityBillAnalysis, importantDates: dates };
}

describe("suggestReminders", () => {
  it("suggests a reminder 3 days before a future date", () => {
    const [suggestion] = suggestReminders(
      result([importantDate({ date: "2026-06-20T00:00:00.000Z" })]),
      NOW,
    );

    expect(suggestion).toMatchObject({
      importantDateId: "date-1",
      title: "Payment due",
      date: "2026-06-20T00:00:00.000Z",
      remindAt: "2026-06-17T00:00:00.000Z",
      needsConfirmation: false,
    });
    expect(reminderSuggestionSchema.parse(suggestion)).toEqual(suggestion);
  });

  it("reminds 1 day before when the date is under 3 days away", () => {
    const [suggestion] = suggestReminders(
      result([importantDate({ date: "2026-06-03T00:00:00.000Z" })]),
      NOW,
    );

    expect(suggestion.remindAt).toBe("2026-06-02T00:00:00.000Z");
  });

  it("skips a date in the past", () => {
    expect(
      suggestReminders(
        result([importantDate({ date: "2026-05-01T00:00:00.000Z" })]),
        NOW,
      ),
    ).toEqual([]);
  });

  it("skips a null or unparseable date", () => {
    expect(
      suggestReminders(
        result([
          importantDate({ id: "a", date: null }),
          importantDate({ id: "b", date: "not a date" }),
        ]),
        NOW,
      ),
    ).toEqual([]);
  });

  it("marks UNCLEAR and INFERRED dates as needing confirmation", () => {
    const suggestions = suggestReminders(
      result([
        importantDate({ id: "unclear", informationStatus: "UNCLEAR" }),
        importantDate({ id: "inferred", informationStatus: "INFERRED" }),
      ]),
      NOW,
    );

    expect(suggestions.map((s) => s.needsConfirmation)).toEqual([true, true]);
  });

  it("marks a FOUND date as not needing confirmation", () => {
    const [suggestion] = suggestReminders(
      result([importantDate({ informationStatus: "FOUND" })]),
      NOW,
    );

    expect(suggestion.needsConfirmation).toBe(false);
  });
});
