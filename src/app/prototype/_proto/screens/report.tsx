"use client";

import {
  Bell,
  BookOpen,
  CalendarClock,
  Check,
  FileText,
  Languages,
  MessageCircle,
  Pencil,
  Send,
  ShieldCheck,
  Trash,
  TriangleExclamationPoint,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { AnalysisResult, Finding } from "@/contracts/analysis";
import type { DocumentCategory, ExplanationLanguage } from "@/contracts/common";
import { getAnalysis, getPage } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { mergeAnalysisResponse, pageToDocPage } from "../adapters";
import { StatusPill, useCopy } from "../common";
import {
  CATEGORY_LABEL,
  daysUntil,
  formatDate,
  LANGUAGE_LABEL,
  relativeDays,
  uid,
  type DocPage,
  type ProtoDoc,
} from "../data";
import { TabErrorBoundary } from "../error-boundary";
import { reminderFor, useDoc, useStore, useToast, type ReportTab } from "../store";
import {
  Btn,
  Callout,
  Empty,
  Meta,
  Panel,
  Screen,
  SectionHeading,
  SeverityTag,
  severityRank,
} from "../ui";

const TABS: { value: ReportTab; label: string }[] = [
  { value: "overview", label: "Summary" },
  { value: "details", label: "Details" },
  { value: "source", label: "Original" },
  { value: "ask", label: "Ask" },
];

/** Single source of truth for the explanation language. Used in the report and Settings. */
function LanguagePicker({ className }: { className?: string }) {
  const { state, dispatch } = useStore();
  return (
    <label className={cn("flex items-center gap-2 text-sm font-semibold text-(--ink-2)", className)}>
      <span className="flex items-center gap-1.5">
        <Languages className="size-5" aria-hidden />
        Explain in
      </span>
      <select
        value={state.language}
        onChange={(e) => dispatch({ type: "setLanguage", language: e.target.value as ExplanationLanguage })}
        className="min-h-10 rounded-lg border border-(--line-2) bg-(--surface) px-2 font-semibold text-(--ink)"
      >
        {(Object.keys(LANGUAGE_LABEL) as ExplanationLanguage[]).map((l) => (
          <option key={l} value={l}>
            {LANGUAGE_LABEL[l]}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ReportScreen({ id, tab, focus }: { id: string; tab: ReportTab; focus?: string }) {
  const { state, dispatch } = useStore();
  const doc = useDoc(id);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  const movedByKey = useRef(false);
  useEffect(() => {
    if (movedByKey.current) {
      activeTabRef.current?.focus();
      movedByKey.current = false;
    }
    activeTabRef.current?.scrollIntoView({ block: "nearest", inline: "center" });
  }, [tab]);

  // Real documents: load the analysis in the chosen language, then the real OCR
  // page text for the Original tab. Re-runs when the language changes.
  const real = doc?.real ?? false;
  const language = state.language;
  useEffect(() => {
    if (!real) return;
    let active = true;
    (async () => {
      try {
        const res = await getAnalysis(id, language);
        if (!active || res.state !== "READY") return;
        const patch = mergeAnalysisResponse(res);
        const numbers = [
          ...new Set(res.analysis.evidence.map((e) => e.pageNumber)),
        ].sort((a, b) => a - b);
        const pages = (
          await Promise.all(
            numbers.map((n) => getPage(id, n).then(pageToDocPage).catch(() => null)),
          )
        ).filter((p): p is DocPage => p !== null);
        if (active) dispatch({ type: "syncDoc", id, patch: { ...patch, pages } });
      } catch {
        // Leave the "no report yet" fallback in place on failure.
      }
    })();
    return () => {
      active = false;
    };
  }, [real, id, language, dispatch]);

  if (!doc) return <Screen back title="Document not found">It may have been deleted.</Screen>;
  if (!doc.analysis)
    return (
      <Screen back title={doc.title}>
        <Callout tone="low" icon={FileText} title="No report yet">
          The report appears once processing finishes.
        </Callout>
      </Screen>
    );

  const setTab = (t: ReportTab, f?: string) =>
    dispatch({ type: "go", replace: true, route: { name: "report", id, tab: t, focus: f } });

  // Roving-tabindex: arrow keys move between tabs, per the WAI-ARIA tabs pattern.
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex((t) => t.value === tab);
    let next = i;
    if (e.key === "ArrowRight") next = (i + 1) % TABS.length;
    else if (e.key === "ArrowLeft") next = (i - 1 + TABS.length) % TABS.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    else return;
    e.preventDefault();
    movedByKey.current = true;
    setTab(TABS[next].value);
  };

  return (
    <Screen
      back
      title={doc.title}
      lead={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>
            {doc.analysis.document.documentSubtype ?? CATEGORY_LABEL[doc.analysis.document.documentType]}
            {doc.analysis.document.issuer ? ` from ${doc.analysis.document.issuer}` : ""}
          </span>
          <StatusPill lifecycle={doc.lifecycle} />
        </span>
      }
    >
      <div className="sticky top-[57px] z-20 -mx-4 mb-6 border-b border-(--line) bg-(--canvas)/95 backdrop-blur lg:top-0">
        <div className="flex items-center gap-2 px-4 sm:px-6">
          <div
            role="tablist"
            aria-label="Report sections"
            onKeyDown={onTabKey}
            className="-mx-1 flex flex-1 gap-1 overflow-x-auto px-1 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {TABS.map((t) => (
              <button
                key={t.value}
                role="tab"
                type="button"
                aria-selected={tab === t.value}
                tabIndex={tab === t.value ? 0 : -1}
                ref={tab === t.value ? activeTabRef : undefined}
                onClick={() => setTab(t.value)}
                className={cn(
                  "min-h-11 shrink-0 rounded-lg px-3 font-semibold",
                  tab === t.value ? "bg-(--surface) text-(--ink) shadow-sm" : "text-(--ink-3) hover:text-(--ink)",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <LanguagePicker className="hidden shrink-0 sm:flex" />
        </div>
        <div className="border-t border-(--line) px-4 py-2 sm:hidden">
          <LanguagePicker className="w-full justify-between" />
        </div>
      </div>

      <div role="tabpanel">
        <TabErrorBoundary label={TABS.find((t) => t.value === tab)?.label ?? "This section"} resetKey={tab}>
          {tab === "overview" ? <Overview doc={doc} a={doc.analysis} onEvidence={(e) => setTab("source", e)} onTab={setTab} /> : null}
          {tab === "details" ? <Details doc={doc} a={doc.analysis} onEvidence={(e) => setTab("source", e)} /> : null}
          {tab === "source" ? <Source doc={doc} a={doc.analysis} focus={focus} /> : null}
          {tab === "ask" ? <Ask doc={doc} a={doc.analysis} onEvidence={(e) => setTab("source", e)} /> : null}
        </TabErrorBoundary>
      </div>
    </Screen>
  );
}

function SourceLink({ ids, a, onEvidence }: { ids: string[]; a: AnalysisResult; onEvidence: (id: string) => void }) {
  if (ids.length === 0)
    return <p className="mt-2 text-sm text-(--ink-3)">Not written in the document, so there&apos;s no page to show.</p>;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {ids.map((eid) => {
        const e = a.evidence.find((x) => x.id === eid);
        if (!e) return null;
        return (
          <button
            key={eid}
            type="button"
            onClick={() => onEvidence(eid)}
            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-(--mark)/45 px-2.5 text-sm font-semibold text-(--ink) hover:bg-(--mark)"
          >
            <FileText className="size-4" aria-hidden />
            {e.sourceType === "USER_CORRECTION" ? "Your correction" : `See page ${e.pageNumber}`}
          </button>
        );
      })}
    </div>
  );
}

function FindingItem({ f, a, doc, onEvidence, aside }: { f: Finding; a: AnalysisResult; doc: ProtoDoc; onEvidence: (id: string) => void; aside?: React.ReactNode }) {
  const copy = useCopy(doc);
  const c = copy.finding(f);
  return (
    <li className="border-b border-(--line) px-4 py-4 last:border-b-0">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-bold">{c.title}</p>
        {aside}
      </div>
      <p className="mt-1 max-w-[65ch] text-(--ink-2)">{c.explanation}</p>
      <Meta finding={f} />
      <SourceLink ids={f.evidenceIds} a={a} onEvidence={onEvidence} />
    </li>
  );
}

function Overview({ doc, a, onEvidence, onTab }: { doc: ProtoDoc; a: AnalysisResult; onEvidence: (id: string) => void; onTab: (t: ReportTab) => void }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const copy = useCopy(doc);
  const watch = [...a.watchouts].sort((x, y) => severityRank(x.severity) - severityRank(y.severity));
  const unresolved = a.reviewRequirements.filter((r) => r.reviewStatus !== "RESOLVED");
  const dates = a.importantDates.filter((d) => d.date);

  return (
    <div>
      {a.analysisMetadata.partial ? (
        <div className="mb-4">
          <Callout tone="high" icon={TriangleExclamationPoint} title={`Page ${a.analysisMetadata.unavailablePages.join(", ")} couldn't be read`}>
            This report only covers the pages we could read. Anything on the missing page isn&apos;t included.
            <div className="mt-3">
              <Btn size="sm" onClick={() => dispatch({ type: "retryOcr", id: doc.id })}>Read missing page again</Btn>
            </div>
          </Callout>
        </div>
      ) : null}

      {unresolved.map((r) => (
        <div key={r.id} className="mb-4">
          <Callout
            tone={r.impactLevel === "CRITICAL" ? "critical" : "high"}
            icon={Pencil}
            title={`Check the ${r.field.toLowerCase()} before you rely on this report`}
            action={
              <Btn variant="primary" onClick={() => dispatch({ type: "go", route: { name: "correct", id: doc.id, reviewId: r.id } })}>
                Check it now
              </Btn>
            }
          >
            {r.reason} {r.impact}
          </Callout>
        </div>
      ))}

      <Panel className="p-5">
        <p className="text-lg font-semibold">{copy.overview}</p>
        <p className="mt-3 max-w-[65ch] text-[1.125rem] leading-relaxed text-(--ink-2)">{copy.explanation}</p>
        {state.language !== "EN" ? (
          <p className="mt-3 text-sm text-(--ink-3)">
            Shown in {LANGUAGE_LABEL[state.language]}. Amounts, dates and names stay exactly as written.
          </p>
        ) : null}
      </Panel>

      <SectionHeading count={watch.length}>Watch out for</SectionHeading>
      {watch.length ? (
        <Panel>
          <ul>
            {watch.slice(0, 3).map((w) => (
              <FindingItem key={w.id} f={w} a={a} doc={doc} onEvidence={onEvidence} aside={w.severity ? <SeverityTag severity={w.severity} /> : null} />
            ))}
          </ul>
          {watch.length > 3 ? (
            <button type="button" onClick={() => onTab("details")} className="w-full border-t border-(--line) px-4 py-3 text-left font-semibold text-(--care-strong)">
              See all {watch.length} in Details
            </button>
          ) : null}
        </Panel>
      ) : (
        <Empty icon={ShieldCheck} title="Nothing unusual found">We didn&apos;t find penalties or unusual conditions in the pages we read.</Empty>
      )}

      {dates.length ? (
        <>
          <SectionHeading>Dates to remember</SectionHeading>
          <Panel>
            <ul>
              {dates.map((d) => {
                const has = state.reminders.some((r) => r.docId === doc.id && r.dueAt === d.date);
                const n = daysUntil(d.date!);
                return (
                  <li key={d.id} className="flex flex-wrap items-center gap-3 border-b border-(--line) px-4 py-3.5 last:border-b-0">
                    <CalendarClock className="size-6 text-(--care)" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{copy.finding(d).title}</p>
                      <p className="text-(--ink-2)">
                        {d.dateText} <span className={cn(n >= 0 && n <= 7 && "font-semibold text-(--high)")}>({relativeDays(d.date!).toLowerCase()})</span>
                      </p>
                    </div>
                    {has ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-(--care-strong)">
                        <Check className="size-5" aria-hidden /> Reminder set
                      </span>
                    ) : (
                      <Btn
                        size="sm"
                        icon={Bell}
                        disabled={n < 0}
                        onClick={() => {
                          dispatch({ type: "addReminder", reminder: reminderFor(doc.id, d.title, d.date!, 3, uid("rem")) });
                          toast(`Reminder set for ${formatDate(d.date!)}, 3 days before`);
                        }}
                      >
                        Remind me
                      </Btn>
                    )}
                  </li>
                );
              })}
            </ul>
          </Panel>
        </>
      ) : null}

      <SectionHeading>What you can do next</SectionHeading>
      <Panel>
        <ol>
          {a.nextSteps.map((s, i) => {
            const c = copy.finding(s);
            return (
              <li key={s.id} className="flex gap-3 border-b border-(--line) px-4 py-4 last:border-b-0">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-(--care-wash) font-bold text-(--care-strong)">{i + 1}</span>
                <div className="min-w-0">
                  <p className="font-bold">{c.title}</p>
                  <p className="mt-0.5 text-(--ink-2)">{c.explanation}</p>
                  <SourceLink ids={s.evidenceIds} a={a} onEvidence={onEvidence} />
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <Limits a={a} />
      <DocActions doc={doc} />
    </div>
  );
}

function Limits({ a }: { a: AnalysisResult }) {
  return (
    <>
      <SectionHeading>What this report can&apos;t tell you</SectionHeading>
      <Panel className="p-4">
        <ul className="list-disc space-y-1.5 pl-5 text-(--ink-2)">
          {a.limitations.map((l) => (
            <li key={l}>{l}</li>
          ))}
          <li>ABOT explains documents. It doesn&apos;t give legal, financial or medical decisions, and it never signs, pays or submits anything for you.</li>
        </ul>
      </Panel>
    </>
  );
}

function DocActions({ doc }: { doc: ProtoDoc }) {
  const { dispatch } = useStore();
  const [confirm, setConfirm] = useState(false);
  const [cat, setCat] = useState<DocumentCategory>(doc.category ?? "OTHER");
  return (
    <>
      <SectionHeading>About this document</SectionHeading>
      <Panel className="divide-y divide-(--line)">
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Document type</p>
            <p className="text-sm text-(--ink-3)">
              Changing it re-checks the report with the right rules. The page isn&apos;t read again.
            </p>
          </div>
          <select
            value={cat}
            onChange={(e) => setCat(e.target.value as DocumentCategory)}
            aria-label="Document type"
            className="min-h-11 rounded-lg border border-(--line-2) bg-(--surface) px-2 font-semibold"
          >
            {(Object.keys(CATEGORY_LABEL) as DocumentCategory[]).map((c) => (
              <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>
            ))}
          </select>
          <Btn
            size="sm"
            disabled={cat === doc.category}
            onClick={() => {
              dispatch({ type: "recheckAs", id: doc.id, category: cat });
              dispatch({ type: "go", replace: true, route: { name: "processing", id: doc.id } });
            }}
          >
            Re-check
          </Btn>
        </div>
        <div className="flex flex-wrap items-center gap-3 p-4">
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Delete this document</p>
            <p className="text-sm text-(--ink-3)">Removes the file, its report and its reminders from your account.</p>
          </div>
          {confirm ? (
            <div className="flex gap-2">
              <Btn size="sm" onClick={() => setConfirm(false)}>Keep it</Btn>
              <Btn size="sm" variant="danger" onClick={() => dispatch({ type: "deleteDoc", id: doc.id })}>Delete for good</Btn>
            </div>
          ) : (
            <Btn size="sm" icon={Trash} onClick={() => setConfirm(true)}>Delete</Btn>
          )}
        </div>
      </Panel>
    </>
  );
}

function Details({ doc, a, onEvidence }: { doc: ProtoDoc; a: AnalysisResult; onEvidence: (id: string) => void }) {
  const groups: { title: string; items: Finding[]; kind?: "watch" | "consequence" }[] = [
    { title: "Key information", items: a.keyInformation },
    { title: "What you're expected to do", items: a.obligations },
    { title: "Watch out for", items: [...a.watchouts].sort((x, y) => severityRank(x.severity) - severityRank(y.severity)), kind: "watch" },
    { title: "What could happen", items: a.consequences, kind: "consequence" },
    ...a.specializedSections.map((s) => ({ title: s.title, items: s.items })),
  ];
  return (
    <div>
      <p className="mb-2 max-w-[65ch] text-(--ink-2)">
        Every finding says whether it&apos;s written in the document or is our interpretation, and links to the page it came from.
      </p>
      {groups.map((g) =>
        g.items.length ? (
          <section key={g.title}>
            <SectionHeading count={g.items.length}>{g.title}</SectionHeading>
            <Panel>
              <ul>
                {g.items.map((f) => (
                  <FindingItem
                    key={f.id}
                    f={f}
                    a={a}
                    doc={doc}
                    onEvidence={onEvidence}
                    aside={
                      g.kind === "watch" && f.severity ? (
                        <SeverityTag severity={f.severity} />
                      ) : g.kind === "consequence" && "kind" in f ? (
                        <span className={cn("rounded-md px-2 py-0.5 text-sm font-semibold", f.kind === "EXPLICIT" ? "bg-(--ink) text-white" : "border border-dashed border-(--ink-3) text-(--ink-2)")}>
                          {f.kind === "EXPLICIT" ? "Stated in the document" : "Possible, not stated"}
                        </span>
                      ) : null
                    }
                  />
                ))}
              </ul>
            </Panel>
          </section>
        ) : null,
      )}
      <Limits a={a} />
    </div>
  );
}

function Source({ doc, a, focus }: { doc: ProtoDoc; a: AnalysisResult; focus?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const ev = a.evidence.find((e) => e.id === focus);
  const linked = [
    ...a.keyInformation, ...a.obligations, ...a.watchouts, ...a.consequences, ...a.nextSteps, ...a.importantDates,
    ...a.specializedSections.flatMap((s) => s.items),
  ].filter((f) => focus && f.evidenceIds.includes(focus));
  const correction = ev?.sourceType === "USER_CORRECTION" ? ev : undefined;
  const originalId = correction ? focus!.replace(/-c$/, "") : focus;

  useEffect(() => {
    ref.current?.querySelector("[data-focus]")?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [focus]);

  return (
    <div className="lg:grid lg:grid-cols-[1fr_18rem] lg:gap-6">
      <div ref={ref} className="space-y-5">
        {doc.previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
          <img src={doc.previewUrl} alt={`Photo you uploaded of ${doc.title}`} className="paper w-full rounded-lg" />
        ) : null}
        {doc.pages.map((p) => (
          <figure key={p.number} className="paper rounded-sm px-5 py-6 sm:px-8" aria-label={`Page ${p.number}`}>
            <figcaption className="mb-4 flex justify-between text-sm text-(--ink-3)">
              <span>Page {p.number}</span>
              <span>Text as we read it</span>
            </figcaption>
            {p.unavailable ? (
              <div className="flex min-h-48 flex-col items-center justify-center gap-2 rounded border border-dashed border-(--line-2) text-center text-(--ink-2)">
                <TriangleExclamationPoint className="size-7 text-(--high)" aria-hidden />
                <p className="font-semibold">This page couldn&apos;t be read</p>
                <p className="text-sm">Nothing on it is used in the report.</p>
              </div>
            ) : (
              <div className="font-ocr space-y-2 text-[0.95rem] leading-relaxed">
                {p.lines.map((l, i) => {
                  const on = l.evidenceId && l.evidenceId === originalId;
                  return (
                    <p
                      key={i}
                      data-focus={on ? "" : undefined}
                      className={cn(l.tone === "title" && "font-bold", l.tone === "muted" && "text-(--ink-3)")}
                    >
                      <span className={cn(on && "hl", l.smudged && !on && "smudge")}>{l.text}</span>
                    </p>
                  );
                })}
              </div>
            )}
          </figure>
        ))}
      </div>

      <aside className="mt-6 lg:mt-0">
        <div className="lg:sticky lg:top-20">
          {ev ? (
            <Panel className="p-4">
              <p className="text-sm font-semibold text-(--ink-3)">Highlighted on page {ev.pageNumber}</p>
              <p className="font-ocr mt-1">&ldquo;{a.evidence.find((e) => e.id === originalId)?.excerpt ?? ev.excerpt}&rdquo;</p>
              {correction ? (
                <div className="mt-3 rounded-lg bg-(--care-wash) p-3">
                  <p className="text-sm font-semibold text-(--care-strong)">Your correction</p>
                  <p className="font-ocr">{correction.excerpt}</p>
                  <p className="mt-1 text-sm text-(--ink-2)">The original reading is kept above for your records.</p>
                </div>
              ) : null}
              {linked.length ? (
                <>
                  <p className="mt-4 text-sm font-semibold text-(--ink-3)">Used for</p>
                  <ul className="mt-1 space-y-1">
                    {linked.map((f) => (
                      <li key={f.id} className="font-semibold">{f.title}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </Panel>
          ) : (
            <Callout tone="low" icon={BookOpen} title="Tap any “See page” link">
              We&apos;ll highlight the exact words the finding came from.
            </Callout>
          )}
          {doc.corrections.length ? (
            <Panel className="mt-4 p-4">
              <p className="font-semibold">Correction history</p>
              <ul className="mt-2 space-y-2 text-sm">
                {doc.corrections.map((c) => (
                  <li key={c.id}>
                    <span className="font-semibold">{c.field}</span>, page {c.pageNumber}
                    <br />
                    <span className="font-ocr text-(--ink-3) line-through">{c.originalValue}</span>{" "}
                    <span className="font-ocr">{c.correctedValue ?? "marked unreadable"}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

type Msg = { id: string; role: "user" | "assistant"; text: string; evidenceIds?: string[] };

function answer(q: string, a: AnalysisResult, lang: ExplanationLanguage): Omit<Msg, "id" | "role"> {
  const s = q.toLowerCase();
  const date = a.importantDates[0];
  const watch = [...a.watchouts].sort((x, y) => severityRank(x.severity) - severityRank(y.severity))[0];
  if (/filipino|tagalog/.test(s) || (lang === "FIL" && /simple|simpler/.test(s)))
    return { text: `Sa madaling salita: ${a.explanation}`, evidenceIds: [] };
  if (/miss|late|deadline|huli/.test(s)) {
    const explicit = a.consequences.find((c) => c.kind === "EXPLICIT");
    const inferred = a.consequences.find((c) => c.kind === "INFERRED");
    if (!explicit && !inferred)
      return { text: `The document doesn't say what happens if you miss ${date ? date.dateText : "the deadline"}. Ask ${a.document.issuer ?? "the issuer"} directly.` };
    return {
      text: [
        explicit ? `The document says: ${explicit.explanation}` : null,
        inferred ? `It doesn't say this, but it's worth asking: ${inferred.explanation}` : null,
      ].filter(Boolean).join("\n\n"),
      evidenceIds: explicit?.evidenceIds,
    };
  }
  if (/which part|where|says that|saan/.test(s) && watch)
    return { text: `“${watch.title}” comes from this line on page ${a.evidence.find((e) => e.id === watch.evidenceIds[0])?.pageNumber ?? 1}:`, evidenceIds: watch.evidenceIds.slice(0, 1) };
  if (/ask|office|itanong/.test(s)) {
    const qs = a.nextSteps.filter((n) => n.informationStatus !== "FOUND" || /ask/i.test(n.title)).map((n) => `• ${n.title}`);
    const lim = a.limitations.slice(0, 1).map((l) => `• ${l.replace(/\.$/, "")}?`);
    return { text: `Questions you could ask ${a.document.issuer ?? "them"}:\n${[...qs, ...lim].join("\n") || "• Can you confirm the amount and due date?"}` };
  }
  if (/simple|simpler|explain/.test(s)) return { text: a.overview + " " + (watch ? `The main thing to watch: ${watch.title.toLowerCase()}.` : ""), evidenceIds: watch?.evidenceIds.slice(0, 1) };
  return {
    text: "We can only answer from what's in this document, and we couldn't find that here. Try asking about the amounts, dates, or what you need to do.",
  };
}

const SUGGESTIONS = [
  "Explain this in simpler terms",
  "What happens if I miss the deadline?",
  "Which part of the document says that?",
  "What should I ask the issuing office?",
  "Explain this in Filipino",
];

function Ask({ doc, a, onEvidence }: { doc: ProtoDoc; a: AnalysisResult; onEvidence: (id: string) => void }) {
  const { state } = useStore();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [thinking, setThinking] = useState(false);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [msgs, thinking]);

  const send = (q: string) => {
    if (!q.trim() || thinking) return;
    setMsgs((m) => [...m, { id: uid("m"), role: "user", text: q.trim() }]);
    setText("");
    setThinking(true);
    setTimeout(() => {
      setMsgs((m) => [...m, { id: uid("m"), role: "assistant", ...answer(q, a, state.language) }]);
      setThinking(false);
    }, 900);
  };

  return (
    <div>
      <Callout tone="low" icon={MessageCircle} title={`Ask about ${doc.title.toLowerCase()}`}>
        Answers come only from this document and point to the line they use. If it isn&apos;t in the document, we&apos;ll tell you.
      </Callout>

      <div className="mt-5 space-y-3" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={cn("flex", m.role === "user" && "justify-end")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-4 py-3 whitespace-pre-line",
                m.role === "user" ? "rounded-br-md bg-(--ink) text-white" : "lift rounded-bl-md border border-(--line) bg-(--surface)",
              )}
            >
              {m.text}
              {m.evidenceIds?.length ? (
                <>
                  {m.evidenceIds.map((eid) => {
                    const e = a.evidence.find((x) => x.id === eid);
                    return e ? <p key={eid} className="font-ocr mt-2 rounded bg-(--paper) px-2 py-1 text-sm"><span className="hl hl-static">{e.excerpt}</span></p> : null;
                  })}
                  <SourceLink ids={m.evidenceIds} a={a} onEvidence={onEvidence} />
                </>
              ) : null}
            </div>
          </div>
        ))}
        {thinking ? (
          <p className="text-(--ink-3)"><span className="pulse-dot">Checking the document…</span></p>
        ) : null}
        <div ref={end} />
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        {SUGGESTIONS.map((s) => (
          <button key={s} type="button" onClick={() => send(s)} className="min-h-10 rounded-full border border-(--line-2) bg-(--surface) px-3.5 text-[0.9375rem] font-semibold hover:border-(--care)">
            {s}
          </button>
        ))}
      </div>

      <form
        className="sticky bottom-20 mt-4 flex gap-2 lg:bottom-4"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
      >
        <label htmlFor="ask" className="sr-only">Your question</label>
        <input
          id="ask"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type your question"
          maxLength={500}
          className="lift min-h-12 min-w-0 flex-1 rounded-xl border border-(--line-2) bg-(--surface) px-4 placeholder:text-(--ink-3)"
        />
        <Btn variant="primary" icon={Send} type="submit" disabled={!text.trim() || thinking} aria-label="Send">
          <span className="hidden sm:inline">Send</span>
        </Btn>
      </form>
    </div>
  );
}

