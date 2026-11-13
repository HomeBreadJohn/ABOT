"use client";

import { ShieldCheck, Trash, UserPlus, Users } from "lucide-react";
import { useState } from "react";

import type { ExplanationLanguage } from "@/contracts/common";
import { cn } from "@/lib/utils";

import { LANGUAGE_LABEL, uid } from "../data";
import { useStore, useToast } from "../store";
import { Btn, Callout, Panel, Screen, SectionHeading, Segmented } from "../ui";

const SAMPLE_LINE: Record<ExplanationLanguage, string> = {
  EN: "Pay PHP 2,450.00 by December 15, 2026 to avoid a surcharge.",
  FIL: "Bayaran ang PHP 2,450.00 hanggang Disyembre 15, 2026 para hindi magka-surcharge.",
  TAGLISH: "Bayaran mo ang PHP 2,450.00 by December 15, 2026 para walang surcharge.",
};

export function SettingsScreen() {
  const { state, dispatch } = useStore();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [docIds, setDocIds] = useState<string[]>([]);
  const ready = state.docs.filter((d) => d.analysis);
  const validEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

  return (
    <Screen title="Settings">
      <SectionHeading>Explanation language</SectionHeading>
      <Panel className="p-4">
        <Segmented
          label="Explanation language"
          value={state.language}
          onChange={(language) => dispatch({ type: "setLanguage", language })}
          options={(Object.keys(LANGUAGE_LABEL) as ExplanationLanguage[]).map((l) => ({ value: l, label: LANGUAGE_LABEL[l] }))}
        />
        <p className="mt-4 rounded-lg bg-(--canvas) p-3 text-lg">{SAMPLE_LINE[state.language]}</p>
        <p className="mt-2 text-sm text-(--ink-3)">
          Changes every report instantly. Your documents aren&apos;t read again, and amounts and dates stay exactly as printed.
        </p>
      </Panel>

      <SectionHeading>Family sharing</SectionHeading>
      <Panel className="divide-y divide-(--line)">
        {state.shares.map((s) => (
          <div key={s.id} className="flex flex-wrap items-center gap-3 p-4">
            <Users className="size-6 text-(--care)" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-semibold">{s.name}</p>
              <p className="text-sm text-(--ink-3)">
                {s.status === "PENDING" ? "Invite sent, not accepted yet. " : ""}
                Can see: {s.docIds.map((id) => state.docs.find((d) => d.id === id)?.title).filter(Boolean).join(", ") || "nothing yet"}
              </p>
            </div>
            <Btn size="sm" icon={Trash} onClick={() => { dispatch({ type: "revokeShare", id: s.id }); toast(`${s.name} can no longer see your documents`); }}>
              Stop sharing
            </Btn>
          </div>
        ))}
        <form
          className="p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!validEmail || docIds.length === 0) return;
            dispatch({ type: "invite", share: { id: uid("share"), name: email, email, docIds, status: "PENDING" } });
            toast(`Invite sent to ${email}`);
            setEmail("");
            setDocIds([]);
          }}
        >
          <p className="font-semibold">Share specific documents with family</p>
          <p className="text-sm text-(--ink-3)">They see only what you pick, after they accept. Nothing is shared by default.</p>
          <label htmlFor="share-email" className="mt-3 block text-sm font-semibold">Their email</label>
          <input
            id="share-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="name@example.com"
            className="mt-1 min-h-12 w-full rounded-xl border border-(--line-2) bg-(--surface) px-4 placeholder:text-(--ink-3)"
          />
          <fieldset className="mt-3">
            <legend className="text-sm font-semibold">Documents to share</legend>
            <div className="mt-1 flex flex-wrap gap-2">
              {ready.map((d) => {
                const on = docIds.includes(d.id);
                return (
                  <label key={d.id} className={cn("flex min-h-10 cursor-pointer items-center gap-2 rounded-full border px-3", on ? "border-(--care) bg-(--care-wash)" : "border-(--line-2)")}>
                    <input type="checkbox" className="size-4 accent-(--care)" checked={on} onChange={() => setDocIds((p) => (on ? p.filter((x) => x !== d.id) : [...p, d.id]))} />
                    {d.title}
                  </label>
                );
              })}
            </div>
          </fieldset>
          <Btn type="submit" variant="primary" icon={UserPlus} className="mt-4" disabled={!validEmail || docIds.length === 0}>
            Send invite
          </Btn>
        </form>
      </Panel>

      <SectionHeading>Privacy</SectionHeading>
      <Callout tone="care" icon={ShieldCheck} title="What ABOT will and won't do">
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Explains your documents and suggests next steps.</li>
          <li>Never signs, pays, submits applications or contacts anyone for you.</li>
          <li>Doesn&apos;t make legal, financial or medical decisions.</li>
          <li>Deleting a document removes it from your account. Copies held by our reading service are covered by its own retention terms.</li>
        </ul>
      </Callout>
    </Screen>
  );
}
