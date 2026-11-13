"use client";

import { Check, CircleQuestionMark, FileX, LoaderCircle } from "lucide-react";
import { useEffect } from "react";

import type { DocumentCategory } from "@/contracts/common";
import { getAnalysis } from "@/lib/api-client";
import { cn } from "@/lib/utils";

import { mergeAnalysisResponse } from "../adapters";
import { CATEGORY_LABEL } from "../data";
import { useDoc, useStore } from "../store";
import { Btn, Callout, Panel, Screen } from "../ui";

const STAGES = [
  { label: "Document received", detail: "Your file is saved privately." },
  { label: "Reading document", detail: "Turning the page into text we can check." },
  { label: "Understanding contents", detail: "Working out what kind of document this is." },
  { label: "Checking important details", detail: "Looking for amounts, dates, duties and risks." },
  { label: "Preparing report", detail: "Linking every finding to where it appears." },
];

export function ProcessingScreen({ id }: { id: string }) {
  const { dispatch } = useStore();
  const doc = useDoc(id);

  const done = doc && !["UPLOADED", "OCR_PROCESSING", "OCR_READY", "OCR_PARTIAL", "ANALYZING", "OCR_FAILED", "ANALYSIS_FAILED"].includes(doc.lifecycle);

  // Real documents: poll the analysis every 2s until READY or FAILED. The `done`
  // effect below handles routing once the merged analysis lands. Stops on unmount.
  const real = doc?.real ?? false;
  useEffect(() => {
    if (!real) return;
    let active = true;
    const poll = async () => {
      try {
        const res = await getAnalysis(id);
        if (!active) return;
        dispatch({ type: "syncDoc", id, patch: mergeAnalysisResponse(res) });
      } catch {
        // Transient errors: keep polling; a persistent failure surfaces via FAILED.
      }
    };
    void poll();
    const t = setInterval(poll, 2000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [real, id, dispatch]);

  useEffect(() => {
    if (!doc || !done || !doc.analysis) return;
    const review = doc.analysis.reviewRequirements.find((r) => r.reviewStatus === "REQUIRED");
    const t = setTimeout(() => {
      dispatch({
        type: "go",
        replace: true,
        route: review
          ? { name: "correct", id: doc.id, reviewId: review.id }
          : { name: "report", id: doc.id, tab: "overview" },
      });
    }, 700);
    return () => clearTimeout(t);
  }, [doc, done, dispatch]);

  if (!doc) return <Screen back title="Document not found">It may have been deleted.</Screen>;

  const failed = doc.lifecycle === "OCR_FAILED" || doc.lifecycle === "ANALYSIS_FAILED";

  return (
    <Screen back title={doc.title} lead={failed ? undefined : "You can leave this screen. We'll keep working and it will appear on Home when it's ready."}>
      {failed ? (
        <Callout
          tone="critical"
          icon={FileX}
          title={doc.lifecycle === "OCR_FAILED" ? "We couldn't read this document" : "We couldn't prepare this report"}
          action={
            <Btn variant="primary" onClick={() => dispatch({ type: "retryOcr", id: doc.id })}>
              Try again
            </Btn>
          }
        >
          {doc.error ?? (doc.lifecycle === "OCR_FAILED" ? "We couldn't turn this file into text we can check." : "We read the file but couldn't finish the report.")} If it fails again, retake the photo in brighter light with all four corners showing.
          We won&apos;t show a report until it succeeds.
        </Callout>
      ) : null}

      {doc.askCategory ? (
        <Panel className="sheet-in mb-6 border-(--care) p-5">
          <div className="flex items-start gap-3">
            <CircleQuestionMark className="mt-0.5 size-6 shrink-0 text-(--care)" aria-hidden />
            <div>
              <p className="text-lg font-bold">What kind of document is this?</p>
              <p className="mt-1 text-(--ink-2)">
                It looks like it could be a government notice or a personal letter. Your answer decides which checks we run.
              </p>
            </div>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {doc.askCategory.map((c: DocumentCategory) => (
              <Btn key={c} onClick={() => dispatch({ type: "setCategory", id: doc.id, category: c })}>
                {CATEGORY_LABEL[c]}
              </Btn>
            ))}
          </div>
        </Panel>
      ) : null}

      <p role="status" aria-live="polite" className="sr-only">
        {failed
          ? "Processing failed."
          : done
            ? "Report ready."
            : `Step ${doc.step + 1} of ${STAGES.length}: ${STAGES[Math.min(doc.step, STAGES.length - 1)].label}.`}
      </p>

      <Panel className="p-5">
        <ol aria-label="Progress" className="relative">
          {STAGES.map((s, i) => {
            const state = failed && i === doc.step ? "failed" : i < doc.step || done ? "done" : i === doc.step ? "active" : "todo";
            return (
              <li key={s.label} className="relative flex gap-4 pb-6 last:pb-0" aria-current={state === "active" ? "step" : undefined}>
                {i < STAGES.length - 1 ? (
                  <span className={cn("absolute top-9 bottom-0 left-[17px] w-0.5", state === "done" ? "bg-(--care)" : "bg-(--line)")} aria-hidden />
                ) : null}
                <span
                  className={cn(
                    "relative flex size-9 shrink-0 items-center justify-center rounded-full border-2",
                    state === "done" && "border-(--care) bg-(--care) text-white",
                    state === "active" && "border-(--care) bg-(--surface) text-(--care)",
                    state === "todo" && "border-(--line-2) bg-(--surface) text-(--ink-3)",
                    state === "failed" && "border-(--critical) bg-(--critical-wash) text-(--critical)",
                  )}
                >
                  {state === "done" ? <Check className="size-5" aria-hidden /> : null}
                  {state === "active" ? <LoaderCircle className="size-5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
                  {state === "failed" ? <FileX className="size-5" aria-hidden /> : null}
                </span>
                <div className="pt-1">
                  <p className={cn("font-semibold", state === "todo" && "text-(--ink-3)")}>
                    {s.label}
                    <span className="sr-only">
                      {state === "done" ? ", done" : state === "active" ? ", in progress" : state === "failed" ? ", failed" : ", not started"}
                    </span>
                  </p>
                  {state === "active" || state === "failed" ? <p className="text-(--ink-2)">{s.detail}</p> : null}
                  {i === 2 && doc.category && (state === "done" || done) ? (
                    <p className="text-(--ink-2)">Sorted as {CATEGORY_LABEL[doc.category]}.</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      </Panel>

      <p className="mt-4 text-sm text-(--ink-3)">
        We show steps, not a percentage, because how long reading takes depends on the document.
      </p>

      {!failed ? (
        <div className="mt-6">
          <Btn onClick={() => dispatch({ type: "go", route: { name: "home" } })}>Go to Home while we work</Btn>
        </div>
      ) : null}
    </Screen>
  );
}
