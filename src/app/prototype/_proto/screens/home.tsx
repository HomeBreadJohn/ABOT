"use client";

import { Bell, Camera, ChevronRight, FileUp, Link2, Pencil, RotateCw } from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ATTENTION, nextDeadline } from "../common";
import { daysUntil, formatDate, relativeDays, type ProtoDoc } from "../data";
import { useStore } from "../store";
import { Btn, Empty, Panel, SectionHeading } from "../ui";
import { cn } from "@/lib/utils";

const URGENCY: Record<string, number> = {
  NEEDS_CORRECTION: 0,
  OCR_FAILED: 1,
  ANALYSIS_FAILED: 1,
  REVIEW_REQUIRED: 2,
};

function attentionReason(d: ProtoDoc): string {
  const required = d.analysis?.reviewRequirements.filter((r) => r.reviewStatus === "REQUIRED") ?? [];
  switch (d.lifecycle) {
    case "NEEDS_CORRECTION":
      return `We couldn't read the ${required[0]?.field.toLowerCase() ?? "key details"} clearly. Check it before you act.`;
    case "REVIEW_REQUIRED":
      return `Please confirm the ${required.map((r) => r.field.toLowerCase()).join(" and ")} we read.`;
    case "OCR_FAILED":
      return "We couldn't read this file. You can try again.";
    case "ANALYSIS_FAILED":
      return "The report couldn't be prepared. You can try again.";
    default:
      return "";
  }
}

function actionFor(d: ProtoDoc): { label: string; icon: LucideIcon } {
  switch (d.lifecycle) {
    case "NEEDS_CORRECTION":
      return { label: "Check the reading", icon: Pencil };
    case "REVIEW_REQUIRED":
      return { label: "Review and confirm", icon: Pencil };
    case "OCR_FAILED":
    case "ANALYSIS_FAILED":
      return { label: "Try again", icon: RotateCw };
    default:
      return { label: "Open", icon: ChevronRight };
  }
}

export function HomeScreen() {
  const { state, dispatch } = useStore();
  const open = (d: ProtoDoc) => {
    if (d.lifecycle === "NEEDS_CORRECTION" || d.lifecycle === "REVIEW_REQUIRED") {
      const r = d.analysis?.reviewRequirements.find((x) => x.reviewStatus === "REQUIRED");
      if (r) return dispatch({ type: "go", route: { name: "correct", id: d.id, reviewId: r.id } });
    }
    if (d.analysis && d.lifecycle === "COMPLETED")
      return dispatch({ type: "go", route: { name: "report", id: d.id, tab: "overview" } });
    dispatch({ type: "go", route: { name: "processing", id: d.id } });
  };

  const attention = state.docs
    .filter((d) => ATTENTION.has(d.lifecycle))
    .sort((a, b) => (URGENCY[a.lifecycle] ?? 9) - (URGENCY[b.lifecycle] ?? 9));
  const [hero, ...restAttention] = attention;

  const upcoming = state.reminders
    .filter((r) => r.status === "SCHEDULED" && daysUntil(r.dueAt) >= 0)
    .sort((a, b) => (a.dueAt < b.dueAt ? -1 : 1))
    .slice(0, 3);
  const recent = state.docs
    .filter((d) => d.lifecycle === "COMPLETED")
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1))
    .slice(0, 4);
  const suggestion = state.relationships.find((r) => r.decision === "SUGGESTED");
  const docName = (id: string) => state.docs.find((d) => d.id === id)?.title ?? "A document";

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pt-6 pb-28 sm:px-6 lg:pb-12">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[2rem] leading-tight font-bold tracking-[-0.025em] text-balance sm:text-[2.5rem]">
            Kumusta, Maria.
          </h1>
          <p className="mt-1.5 text-lg text-(--ink-2)">
            {attention.length > 0
              ? `${attention.length === 1 ? "One document needs" : `${attention.length} documents need`} you before you rely on ${attention.length === 1 ? "it" : "them"}.`
              : "Nothing needs your attention right now."}
          </p>
        </div>
        <div className="hidden gap-2 sm:flex">
          <Btn variant="primary" icon={Camera} onClick={() => dispatch({ type: "go", route: { name: "upload" } })}>
            Take a photo
          </Btn>
          <Btn icon={FileUp} onClick={() => dispatch({ type: "go", route: { name: "upload" } })}>
            Choose a file
          </Btn>
        </div>
      </div>

      {/* Hero: the one thing that most needs the user right now. */}
      {hero ? (
        <HeroCard doc={hero} onOpen={() => open(hero)} />
      ) : (
        <div className="mt-6 rounded-3xl border border-(--care)/15 bg-(--care-wash) p-6 sm:p-8">
          <p className="text-xl font-bold text-(--care-strong)">You&apos;re all caught up.</p>
          <p className="mt-1 max-w-[52ch] text-(--ink-2)">
            Nothing needs checking. Add a document and ABOT will tell you what it means and what to do next.
          </p>
          <Btn variant="primary" icon={Camera} className="mt-4 sm:hidden" onClick={() => dispatch({ type: "go", route: { name: "upload" } })}>
            Add a document
          </Btn>
        </div>
      )}

      <div className="mt-8 grid gap-x-8 gap-y-8 lg:grid-cols-[1.4fr_1fr]">
        {/* Primary column */}
        <div className="min-w-0">
          {restAttention.length > 0 ? (
            <section>
              <SectionHeading count={attention.length}>Also needs you</SectionHeading>
              <Panel>
                <ul>
                  {restAttention.map((d) => {
                    const action = actionFor(d);
                    return (
                      <li key={d.id} className="border-b border-(--line) last:border-b-0">
                        <button
                          type="button"
                          onClick={() => open(d)}
                          className="flex w-full items-center gap-3 px-4 py-4 text-left hover:bg-(--canvas)"
                        >
                          <action.icon className="size-5 shrink-0 text-(--high)" aria-hidden />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate font-semibold">{d.title}</span>
                            <span className="block text-[0.9375rem] text-(--ink-2)">{attentionReason(d)}</span>
                          </span>
                          <ChevronRight className="size-5 shrink-0 text-(--ink-3)" aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </section>
          ) : null}

          {suggestion ? (
            <section>
              <SectionHeading>These may belong together</SectionHeading>
              <div className="rounded-2xl border border-dashed border-(--care)/40 bg-(--care-wash)/50 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-(--surface) text-(--care)">
                    <Link2 className="size-5" aria-hidden />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">
                      {docName(suggestion.sourceId)} may be the payment for {docName(suggestion.targetId).toLowerCase()}.
                    </p>
                    <p className="mt-1 text-(--ink-2)">{suggestion.reasons.slice(0, 2).join(". ")}. You decide if they&apos;re linked.</p>
                    <Btn
                      className="mt-3"
                      size="sm"
                      onClick={() => dispatch({ type: "go", route: { name: "cross", ids: [suggestion.sourceId, suggestion.targetId] } })}
                    >
                      Compare them
                    </Btn>
                  </div>
                </div>
              </div>
            </section>
          ) : null}

          {restAttention.length === 0 && !suggestion ? (
            <Empty icon={Bell} title="Nothing else pending">
              Documents that need a second look will appear here.
            </Empty>
          ) : null}
        </div>

        {/* Quieter side rail: reference, not action. */}
        <aside className="min-w-0 space-y-8">
          <section>
            <RailHeading onAll={() => dispatch({ type: "go", route: { name: "reminders" } })}>Coming up</RailHeading>
            {upcoming.length > 0 ? (
              <ul className="space-y-1">
                {upcoming.map((r) => {
                  const n = daysUntil(r.dueAt);
                  return (
                    <li key={r.id} className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-(--surface)">
                      <div className={cn("flex w-12 shrink-0 flex-col items-center rounded-lg py-1", n <= 7 ? "bg-(--high-wash) text-(--high)" : "bg-(--surface) text-(--ink-2)")}>
                        <span className="text-xs font-semibold uppercase">{formatDate(r.dueAt).slice(0, 3)}</span>
                        <span className="text-xl leading-none font-bold">{Number(r.dueAt.slice(8, 10))}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{r.title}</p>
                        <p className="text-sm text-(--ink-3)">{relativeDays(r.dueAt)}</p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 text-(--ink-3)">No deadlines yet.</p>
            )}
          </section>

          <section>
            <RailHeading onAll={() => dispatch({ type: "go", route: { name: "vault" } })}>Recently explained</RailHeading>
            {recent.length > 0 ? (
              <ul className="space-y-1">
                {recent.map((d) => {
                  const due = nextDeadline(d);
                  return (
                    <li key={d.id}>
                      <button
                        type="button"
                        onClick={() => open(d)}
                        className="flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left hover:bg-(--surface)"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{d.title}</span>
                          <span className="block text-sm text-(--ink-3)">
                            {due ? `${due.title}: ${relativeDays(due.date!).toLowerCase()}` : "Report ready"}
                          </span>
                        </span>
                        <ChevronRight className="size-4 shrink-0 text-(--ink-3)" aria-hidden />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="px-2 text-(--ink-3)">No reports yet.</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function RailHeading({ children, onAll }: { children: React.ReactNode; onAll: () => void }) {
  return (
    <div className="mb-2 flex items-baseline justify-between border-b border-(--line) pb-2">
      <h2 className="text-sm font-bold tracking-[0.04em] text-(--ink-3) uppercase">{children}</h2>
      <button type="button" onClick={onAll} className="text-sm font-semibold text-(--care-strong) hover:underline">
        See all
      </button>
    </div>
  );
}

function HeroCard({ doc, onOpen }: { doc: ProtoDoc; onOpen: () => void }) {
  const action = actionFor(doc);
  const critical = doc.lifecycle === "NEEDS_CORRECTION" || doc.lifecycle === "OCR_FAILED" || doc.lifecycle === "ANALYSIS_FAILED";
  const subtype = doc.analysis?.document.documentSubtype ?? doc.filename;
  return (
    <div className="sheet-in mt-6 overflow-hidden rounded-3xl border border-(--mark-strong)/40 bg-gradient-to-br from-(--mark)/35 to-(--paper) shadow-[0_2px_4px_rgb(27_29_51/0.06),0_18px_40px_-20px_rgb(27_29_51/0.35)]">
      <div className="flex flex-col gap-5 p-6 sm:p-8">
        <div className="flex items-center gap-2">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-bold", critical ? "bg-(--critical) text-white" : "bg-(--high) text-white")}>
            <action.icon className="size-4" aria-hidden />
            {critical ? "Needs you now" : "Needs a look"}
          </span>
        </div>
        <div>
          <p className="text-sm font-semibold text-(--ink-3)">{subtype}</p>
          <h2 className="mt-0.5 text-2xl font-bold tracking-[-0.02em] text-balance sm:text-[1.75rem]">{doc.title}</h2>
          <p className="mt-2 max-w-[52ch] text-lg leading-relaxed text-(--ink-2)">{attentionReason(doc)}</p>
        </div>
        <div>
          <Btn variant="primary" size="lg" icon={action.icon} onClick={onOpen}>
            {action.label}
          </Btn>
        </div>
      </div>
    </div>
  );
}
