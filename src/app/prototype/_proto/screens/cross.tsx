"use client";

import { Check, FileText, Info, Link2, TriangleExclamationPoint, X } from "lucide-react";

import type { RelationshipType } from "@/contracts/common";

import { uid } from "../data";
import { useStore, useToast } from "../store";
import { Btn, Callout, Panel, Screen, SectionHeading, confidenceWords } from "../ui";

const REL_LABEL: Record<RelationshipType, string> = {
  POSSIBLE_MATCH: "May be related",
  CONFIRMED_MATCH: "Linked by you",
  CONTRADICTS: "Disagree with each other",
  SUPPLEMENTS: "Adds to the other",
  SUPERSEDES: "Replaces the other",
  UNRELATED: "Not related",
};

export function CrossScreen({ ids }: { ids: string[] }) {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const docs = ids.map((id) => state.docs.find((d) => d.id === id)).filter((d) => d !== undefined);
  const rel = state.relationships.find(
    (r) => ids.includes(r.sourceId) && ids.includes(r.targetId),
  );

  if (docs.length < 2) return <Screen back title="Pick two documents">Choose them from Your documents.</Screen>;

  const sharedAccount = docs.every((d) => d.pages.some((p) => p.lines.some((l) => l.text.includes("0412-5567-01"))));

  return (
    <Screen back title="Compare documents" lead={docs.map((d) => d.title).join(" and ")}>
      <div className="grid gap-3 sm:grid-cols-2">
        {docs.map((d) => (
          <Panel key={d.id} className="p-4">
            <div className="flex items-start gap-3">
              <FileText className="mt-0.5 size-6 text-(--care)" aria-hidden />
              <div className="min-w-0">
                <p className="font-bold">{d.title}</p>
                <p className="text-sm text-(--ink-3)">{d.analysis?.document.documentSubtype}</p>
                <ul className="mt-2 space-y-1 text-[0.9375rem]">
                  {d.analysis?.keyInformation.slice(0, 3).map((k) => (
                    <li key={k.id}>
                      <span className="text-(--ink-3)">{k.title}:</span> {k.explanation.replace(/\.$/, "")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </Panel>
        ))}
      </div>

      {rel ? (
        <>
          <SectionHeading>What we noticed</SectionHeading>
          <Panel className="p-5">
            <div className="flex flex-wrap items-center gap-2">
              <Link2 className="size-5 text-(--care)" aria-hidden />
              <p className="font-bold">{REL_LABEL[rel.type]}</p>
              <span className="text-sm text-(--ink-3)">{confidenceWords(rel.confidence)} ({Math.round(rel.confidence * 100)}%)</span>
            </div>
            <ul className="mt-3 space-y-2">
              {rel.reasons.map((r) => (
                <li key={r} className="flex gap-2">
                  <Check className="mt-1 size-4 shrink-0 text-(--care)" aria-hidden />
                  <span>{r}. <span className="text-(--ink-3)">Both on page 1.</span></span>
                </li>
              ))}
            </ul>
            <div className="mt-4">
              <Callout tone="medium" icon={TriangleExclamationPoint} title="Matching amounts don't prove the bill is paid">
                The receipt doesn&apos;t name the billing month. Check your next bill shows no unpaid balance, or ask the
                cooperative to confirm.
              </Callout>
            </div>

            {rel.decision === "SUGGESTED" ? (
              <div className="mt-5">
                <p className="font-semibold">Are these two linked?</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn variant="primary" icon={Check} onClick={() => { dispatch({ type: "decideRelationship", id: rel.id, decision: "APPROVED" }); toast("Linked. Both reports now mention each other."); }}>
                    Yes, link them
                  </Btn>
                  <Btn icon={X} onClick={() => { dispatch({ type: "decideRelationship", id: rel.id, decision: "REJECTED" }); toast("Got it. We won't suggest this again."); }}>
                    No, they&apos;re separate
                  </Btn>
                </div>
              </div>
            ) : (
              <p className="mt-5 flex items-center gap-2 font-semibold text-(--care-strong)">
                <Check className="size-5" aria-hidden />
                {rel.decision === "APPROVED" ? "You linked these documents." : "You said these aren't related."}
              </p>
            )}
          </Panel>
        </>
      ) : (
        <>
          <SectionHeading>What we noticed</SectionHeading>
          <Callout tone="low" icon={Info} title={sharedAccount ? "These share an account number" : "We didn't find a clear link"}>
            {sharedAccount
              ? "That alone doesn't mean one settles the other."
              : "No matching names, numbers or dates. You can still link them yourself."}
            <div className="mt-3">
              <Btn
                size="sm"
                onClick={() => {
                  dispatch({
                    type: "addRelationship",
                    relationship: { id: uid("rel"), sourceId: ids[0], targetId: ids[1], type: "CONFIRMED_MATCH", confidence: 1, decision: "APPROVED", reasons: ["Linked by you"] },
                  });
                  toast("Linked.");
                }}
              >
                Link them anyway
              </Btn>
            </div>
          </Callout>
        </>
      )}

      <p className="mt-6 text-sm text-(--ink-3)">
        Only documents you pick are read together. Someone else&apos;s documents are never included unless they share them with you.
      </p>
    </Screen>
  );
}
