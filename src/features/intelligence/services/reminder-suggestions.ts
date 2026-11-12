/**
 * Reminder suggestions from an analysis (plan Task B23).
 *
 * Pure function, no I/O: turns the analysis's importantDates into reminder
 * suggestions for Person 1's reminder CRUD to consume. Person 2 NEVER creates
 * reminder rows — this only SUGGESTS.
 *
 * Rules:
 * - Only importantDates with a parseable ISO `date` in the FUTURE (relative to
 *   `now`) produce a suggestion. Unparseable, null, or past dates are skipped.
 * - remindAt is 3 days before the date, or 1 day before when the date is under
 *   3 days away from `now`.
 * - A date whose informationStatus is UNCLEAR or INFERRED needs confirmation.
 */
import type { AnalysisResult, ReminderSuggestion } from "@/contracts";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export function suggestReminders(
  result: AnalysisResult,
  now: Date,
): ReminderSuggestion[] {
  const suggestions: ReminderSuggestion[] = [];
  for (const entry of result.importantDates) {
    if (entry.date === null) continue;
    const due = new Date(entry.date);
    const dueMs = due.getTime();
    if (Number.isNaN(dueMs) || dueMs <= now.getTime()) continue;

    const lead = dueMs - now.getTime() < THREE_DAYS_MS ? ONE_DAY_MS : THREE_DAYS_MS;
    suggestions.push({
      importantDateId: entry.id,
      title: entry.title,
      date: due.toISOString(),
      remindAt: new Date(dueMs - lead).toISOString(),
      needsConfirmation:
        entry.informationStatus === "UNCLEAR" ||
        entry.informationStatus === "INFERRED",
    });
  }
  return suggestions;
}
