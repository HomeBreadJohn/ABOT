"use client";

import { FolderOpen, Layers, Search, X } from "lucide-react";
import { useState } from "react";

import type { DocumentCategory } from "@/contracts/common";
import { cn } from "@/lib/utils";

import { DocRow } from "../common";
import { CATEGORY_LABEL, type ProtoDoc } from "../data";
import { useStore } from "../store";
import { Btn, Empty, Panel, Screen } from "../ui";

export function VaultScreen() {
  const { state, dispatch } = useStore();
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<DocumentCategory | "ALL">("ALL");
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const cats = Array.from(new Set(state.docs.map((d) => d.category).filter(Boolean))) as DocumentCategory[];
  const list = state.docs
    .filter((d) => cat === "ALL" || d.category === cat)
    .filter((d) => d.title.toLowerCase().includes(q.trim().toLowerCase()))
    .sort((a, b) => (a.uploadedAt < b.uploadedAt ? 1 : -1));

  const open = (d: ProtoDoc) =>
    dispatch({
      type: "go",
      route: d.analysis && !["OCR_FAILED", "ANALYZING"].includes(d.lifecycle) ? { name: "report", id: d.id, tab: "overview" } : { name: "processing", id: d.id },
    });

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <Screen
      title="Your documents"
      lead="Every document keeps its own report. Compare two when they're related."
      actions={
        selecting ? (
          <Btn icon={X} onClick={() => { setSelecting(false); setPicked([]); }}>Cancel</Btn>
        ) : (
          <Btn icon={Layers} onClick={() => setSelecting(true)}>Compare documents</Btn>
        )
      }
    >
      <div className="mb-4 flex flex-col gap-3">
        <label className="lift flex min-h-12 items-center gap-2 rounded-xl border border-(--line-2) bg-(--surface) px-3">
          <Search className="size-5 text-(--ink-3)" aria-hidden />
          <span className="sr-only">Search documents</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-(--ink-3)" />
        </label>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {(["ALL", ...cats] as const).map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={cat === c}
              onClick={() => setCat(c)}
              className={cn(
                "min-h-10 shrink-0 rounded-full border px-3.5 font-semibold",
                cat === c ? "border-(--ink) bg-(--ink) text-white" : "border-(--line-2) bg-(--surface) text-(--ink-2)",
              )}
            >
              {c === "ALL" ? "All" : CATEGORY_LABEL[c]}
            </button>
          ))}
        </div>
      </div>

      {selecting ? (
        <p className="mb-3 font-semibold text-(--care-strong)">
          Pick 2 or more documents. Only the ones you pick are read together.
        </p>
      ) : null}

      {list.length ? (
        <Panel>
          <ul>
            {list.map((d) => (
              <DocRow
                key={d.id}
                doc={d}
                onOpen={() => (selecting ? d.analysis && toggle(d.id) : open(d))}
                leading={
                  selecting ? (
                    <label className="flex items-center pl-4">
                      <span className="sr-only">Select {d.title}</span>
                      <input
                        type="checkbox"
                        disabled={!d.analysis}
                        checked={picked.includes(d.id)}
                        onChange={() => toggle(d.id)}
                        className="size-6 accent-(--care)"
                      />
                    </label>
                  ) : undefined
                }
              />
            ))}
          </ul>
        </Panel>
      ) : (
        <Empty icon={FolderOpen} title={q ? "No documents match" : "No documents yet"}>
          {q ? "Try a different word." : "Add a photo or file to get your first explanation."}
        </Empty>
      )}

      {selecting ? (
        <div className="sticky bottom-20 mt-5 lg:bottom-4">
          <Btn
            variant="primary"
            size="lg"
            className="w-full"
            disabled={picked.length < 2}
            onClick={() => dispatch({ type: "go", route: { name: "cross", ids: picked } })}
          >
            {picked.length < 2 ? "Pick at least 2" : `Compare ${picked.length} documents`}
          </Btn>
        </div>
      ) : null}
    </Screen>
  );
}
