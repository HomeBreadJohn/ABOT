"use client";

import { Check, CircleQuestionMark, Pencil } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

import { uid } from "../data";
import { useDoc, useStore } from "../store";
import { Btn, Callout, Panel, Screen } from "../ui";

type Choice = "confirm" | "edit" | "unreadable";

/** Pull the value part out of an excerpt like "Total Am0unt Due: PHP 741.85". */
function valueOf(excerpt: string): string {
  const i = excerpt.indexOf(":");
  return i >= 0 ? excerpt.slice(i + 1).trim() : excerpt;
}

export function CorrectScreen({ id, reviewId }: { id: string; reviewId: string }) {
  const { dispatch } = useStore();
  const doc = useDoc(id);
  const review = doc?.analysis?.reviewRequirements.find((r) => r.id === reviewId);
  const evidence = doc?.analysis?.evidence.find((e) => e.id === review?.evidenceId);
  const read = evidence ? valueOf(evidence.excerpt) : "";
  const [choice, setChoice] = useState<Choice | null>(null);
  const [value, setValue] = useState(read);

  if (!doc || !review) return <Screen back title="Nothing to check">This item may already be resolved.</Screen>;

  const page = doc.pages.find((p) => p.number === review.pageNumber);
  const line = page?.lines.find((l) => l.evidenceId === review.evidenceId);
  const critical = review.impactLevel === "CRITICAL";

  const submit = () => {
    if (!choice) return;
    const corrected = choice === "unreadable" ? null : choice === "confirm" ? read : value.trim();
    dispatch({
      type: "correct",
      id: doc.id,
      reviewId: review.id,
      value: corrected,
      record: {
        id: uid("cor"),
        reviewId: review.id,
        field: review.field,
        pageNumber: review.pageNumber,
        evidenceId: review.evidenceId,
        originalValue: read,
        correctedValue: corrected,
        createdAt: new Date().toISOString(),
      },
    });
    dispatch({ type: "go", replace: true, route: { name: "processing", id: doc.id } });
  };

  const options: { value: Choice; title: string; hint: string; icon: typeof Check }[] = [
    { value: "confirm", title: `Yes, it says ${read}`, hint: "The reading matches my paper.", icon: Check },
    { value: "edit", title: "No, it says something else", hint: "I'll type what's on the paper.", icon: Pencil },
    { value: "unreadable", title: "I can't read it either", hint: "Don't guess. I'll ask the issuer.", icon: CircleQuestionMark },
  ];

  return (
    <Screen back title={`Check the ${review.field.toLowerCase()}`} lead={`${doc.title}, page ${review.pageNumber}`}>
      <Callout tone={critical ? "critical" : "high"} icon={Pencil} title={critical ? "We need you to check this before showing the report" : "Please confirm this before you rely on it"}>
        {review.reason} {review.impact}
      </Callout>

      <figure className="paper mt-5 rounded-sm px-5 py-6 sm:px-8">
        <figcaption className="mb-3 text-sm text-(--ink-3)">The part of page {review.pageNumber} we read</figcaption>
        <p className="font-ocr text-xl leading-relaxed sm:text-2xl">
          <span className="hl smudge">{line?.text ?? evidence?.excerpt}</span>
        </p>
        <p className="mt-3 text-sm text-(--ink-3)">Look at your paper copy too. The photo may be blurry in this spot.</p>
      </figure>

      <fieldset className="mt-6">
        <legend className="mb-3 text-lg font-bold">What does your paper say?</legend>
        <div className="space-y-2">
          {options.map((o) => (
            <label
              key={o.value}
              className={cn(
                "lift flex min-h-16 cursor-pointer items-center gap-3 rounded-2xl border-2 bg-(--surface) px-4 py-3",
                choice === o.value ? "border-(--care)" : "border-(--line)",
              )}
            >
              <input type="radio" name="choice" value={o.value} checked={choice === o.value} onChange={() => setChoice(o.value)} className="size-5 accent-(--care)" />
              <o.icon className="size-5 shrink-0 text-(--care)" aria-hidden />
              <span>
                <span className="block font-bold">{o.title}</span>
                <span className="text-(--ink-2)">{o.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {choice === "edit" ? (
        <div className="mt-4">
          <label htmlFor="value" className="font-semibold">{review.field}, exactly as printed</label>
          <input
            id="value"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="font-ocr lift mt-1.5 min-h-12 w-full rounded-xl border border-(--line-2) bg-(--surface) px-4 text-lg"
          />
        </div>
      ) : null}

      <Panel className="mt-6 p-4 text-(--ink-2)">
        We keep the original reading and save your answer separately, with a record of the change. Only the findings that use
        this value are re-checked.
      </Panel>

      <div className="mt-6 flex flex-col gap-2 sm:flex-row">
        <Btn variant="primary" size="lg" disabled={!choice || (choice === "edit" && !value.trim())} onClick={submit}>
          Save and update the report
        </Btn>
        {!critical ? (
          <Btn size="lg" onClick={() => dispatch({ type: "go", replace: true, route: { name: "report", id: doc.id, tab: "overview" } })}>
            Check later
          </Btn>
        ) : null}
      </div>
    </Screen>
  );
}
