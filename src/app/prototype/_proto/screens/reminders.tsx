"use client";

import { Bell, Check, Trash } from "lucide-react";

import { cn } from "@/lib/utils";

import { daysUntil, formatDate, relativeDays } from "../data";
import { useStore } from "../store";
import { Empty, Panel, Screen, SectionHeading } from "../ui";

export function RemindersScreen() {
  const { state, dispatch } = useStore();
  const docTitle = (id: string) => state.docs.find((d) => d.id === id)?.title ?? "Deleted document";
  const scheduled = state.reminders.filter((r) => r.status === "SCHEDULED").sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1));
  const done = state.reminders.filter((r) => r.status === "DONE");

  const Row = ({ r }: { r: (typeof state.reminders)[number] }) => {
    const n = daysUntil(r.dueAt);
    const isDone = r.status === "DONE";
    return (
      <li className="flex items-center gap-3 border-b border-(--line) px-4 py-3.5 last:border-b-0">
        <button
          type="button"
          aria-pressed={isDone}
          aria-label={isDone ? `Mark ${r.title} as not done` : `Mark ${r.title} as done`}
          onClick={() => dispatch({ type: "toggleReminder", id: r.id })}
          className={cn(
            "flex size-8 shrink-0 items-center justify-center rounded-full border-2",
            isDone ? "border-(--care) bg-(--care) text-white" : "border-(--line-2) hover:border-(--care)",
          )}
        >
          {isDone ? <Check className="size-5" aria-hidden /> : null}
        </button>
        <button
          type="button"
          onClick={() => dispatch({ type: "go", route: { name: "report", id: r.docId, tab: "overview" } })}
          className="min-w-0 flex-1 text-left"
        >
          <p className={cn("font-semibold", isDone && "text-(--ink-3) line-through")}>{r.title}</p>
          <p className="text-sm text-(--ink-3)">
            {docTitle(r.docId)}. Due {formatDate(r.dueAt)}, we&apos;ll remind you {formatDate(r.remindAt)}.
          </p>
        </button>
        {!isDone ? (
          <span className={cn("shrink-0 text-right", n <= 7 ? "font-semibold text-(--high)" : "text-(--ink-2)")}>{relativeDays(r.dueAt)}</span>
        ) : null}
        <button
          type="button"
          aria-label={`Delete reminder ${r.title}`}
          onClick={() => dispatch({ type: "deleteReminder", id: r.id })}
          className="flex size-10 shrink-0 items-center justify-center rounded-lg text-(--ink-3) hover:bg-(--canvas)"
        >
          <Trash className="size-5" aria-hidden />
        </button>
      </li>
    );
  };

  return (
    <Screen title="Reminders" lead="Set from the dates in your documents. Tap one to see where the date came from.">
      {scheduled.length ? (
        <Panel>
          <ul>{scheduled.map((r) => <Row key={r.id} r={r} />)}</ul>
        </Panel>
      ) : (
        <Empty icon={Bell} title="No reminders">Open a report and tap “Remind me” next to a date.</Empty>
      )}
      {done.length ? (
        <>
          <SectionHeading count={done.length}>Done</SectionHeading>
          <Panel>
            <ul>{done.map((r) => <Row key={r.id} r={r} />)}</ul>
          </Panel>
        </>
      ) : null}
    </Screen>
  );
}
