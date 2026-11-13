"use client";

import {
  createContext,
  useContext,
  useEffect,
  useReducer,
  type Dispatch,
  type ReactNode,
} from "react";

import type { AnalysisResult } from "@/contracts/analysis";
import type { DocumentCategory, ExplanationLanguage } from "@/contracts/common";

import {
  applyCorrection,
  finalLifecycle,
  initialDocs,
  initialRelationships,
  initialReminders,
  PROCESSING_LIFECYCLES,
  shiftDate,
  type CorrectionRecord,
  type ProtoDoc,
  type Relationship,
  type Reminder,
  type Share,
} from "./data";

export type ReportTab = "overview" | "details" | "source" | "ask";

export type Route =
  | { name: "home" }
  | { name: "upload" }
  | { name: "processing"; id: string }
  | { name: "report"; id: string; tab: ReportTab; focus?: string }
  | { name: "correct"; id: string; reviewId: string }
  | { name: "vault" }
  | { name: "cross"; ids: string[] }
  | { name: "reminders" }
  | { name: "settings" };

export type State = {
  route: Route;
  history: Route[];
  docs: ProtoDoc[];
  relationships: Relationship[];
  reminders: Reminder[];
  shares: Share[];
  language: ExplanationLanguage;
  toast: { id: number; text: string } | null;
};

export type Action =
  | { type: "go"; route: Route; replace?: boolean }
  | { type: "back" }
  | { type: "tick" }
  | { type: "addDocs"; docs: ProtoDoc[] }
  | { type: "setCategory"; id: string; category: DocumentCategory }
  | { type: "recheckAs"; id: string; category: DocumentCategory }
  | { type: "retryOcr"; id: string }
  | {
      type: "correct";
      id: string;
      reviewId: string;
      value: string | null;
      record: CorrectionRecord;
    }
  | { type: "deleteDoc"; id: string }
  | { type: "decideRelationship"; id: string; decision: "APPROVED" | "REJECTED" }
  | { type: "addRelationship"; relationship: Relationship }
  | { type: "addReminder"; reminder: Reminder }
  | { type: "toggleReminder"; id: string }
  | { type: "deleteReminder"; id: string }
  | { type: "setLanguage"; language: ExplanationLanguage }
  | { type: "invite"; share: Share }
  | { type: "revokeShare"; id: string }
  | { type: "toast"; text: string; id: number }
  | { type: "clearToast" }
  | { type: "reset" };

export const initialState: State = {
  route: { name: "home" },
  history: [],
  docs: initialDocs,
  relationships: initialRelationships,
  reminders: initialReminders,
  shares: [
    {
      id: "share-1",
      name: "Lourdes Santos (Nanay)",
      email: "lourdes@example.com",
      docIds: ["doc-lab"],
      status: "ACTIVE",
    },
  ],
  language: "EN",
  toast: null,
};

function updateDoc(
  state: State,
  id: string,
  fn: (d: ProtoDoc) => ProtoDoc,
): State {
  return { ...state, docs: state.docs.map((d) => (d.id === id ? fn(d) : d)) };
}

/** Advance one simulated pipeline step. Mirrors the real lifecycle order. */
function advance(d: ProtoDoc): ProtoDoc {
  if (!PROCESSING_LIFECYCLES.has(d.lifecycle)) return d;
  switch (d.lifecycle) {
    case "UPLOADED":
      return { ...d, lifecycle: "OCR_PROCESSING", step: 1 };
    case "OCR_PROCESSING":
      return { ...d, lifecycle: "OCR_READY", step: 1 };
    case "OCR_READY":
    case "OCR_PARTIAL":
      return { ...d, lifecycle: "ANALYZING", step: 2 };
    case "ANALYZING": {
      if (d.step === 2) {
        if (d.ambiguous && !d.category) {
          return {
            ...d,
            askCategory: ["GOVERNMENT", "PERSONAL", "LEGAL", "OTHER"],
          };
        }
        return {
          ...d,
          step: 3,
          category: d.category ?? d.pending?.document.documentType ?? "OTHER",
        };
      }
      if (d.step === 3) return { ...d, step: 4 };
      const result: AnalysisResult | null = d.pending ?? d.analysis;
      if (!result) return { ...d, lifecycle: "ANALYSIS_FAILED" };
      const category = d.category ?? result.document.documentType;
      const analysis = {
        ...result,
        document: { ...result.document, documentType: category },
      };
      return {
        ...d,
        analysis,
        pending: null,
        category,
        lifecycle: finalLifecycle(analysis),
      };
    }
    default:
      return d;
  }
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "go":
      return {
        ...state,
        route: action.route,
        history: action.replace
          ? state.history
          : [...state.history, state.route].slice(-20),
      };
    case "back": {
      const prev = state.history.at(-1) ?? { name: "home" };
      return { ...state, route: prev, history: state.history.slice(0, -1) };
    }
    case "tick":
      return { ...state, docs: state.docs.map(advance) };
    case "addDocs":
      return { ...state, docs: [...action.docs, ...state.docs] };
    case "setCategory":
      return updateDoc(state, action.id, (d) => ({
        ...d,
        category: action.category,
        askCategory: undefined,
        step: 3,
      }));
    case "recheckAs":
      return updateDoc(state, action.id, (d) => ({
        ...d,
        category: action.category,
        lifecycle: "ANALYZING",
        step: 2,
        pending: d.analysis,
      }));
    case "retryOcr":
      return updateDoc(state, action.id, (d) => ({
        ...d,
        lifecycle: "OCR_PROCESSING",
        step: 1,
        error: undefined,
        pending: d.pending ?? d.analysis,
      }));
    case "correct":
      return updateDoc(state, action.id, (d) => {
        if (!d.analysis) return d;
        return {
          ...d,
          corrections: [action.record, ...d.corrections],
          pending: applyCorrection(d.analysis, action.reviewId, action.value),
          lifecycle: "ANALYZING",
          step: 3,
        };
      });
    case "deleteDoc":
      return {
        ...state,
        docs: state.docs.filter((d) => d.id !== action.id),
        reminders: state.reminders.filter((r) => r.docId !== action.id),
        relationships: state.relationships.filter(
          (r) => r.sourceId !== action.id && r.targetId !== action.id,
        ),
        route: { name: "vault" },
        history: [],
      };
    case "decideRelationship":
      return {
        ...state,
        relationships: state.relationships.map((r) =>
          r.id === action.id
            ? {
                ...r,
                decision: action.decision,
                type:
                  action.decision === "APPROVED" && r.type === "POSSIBLE_MATCH"
                    ? "CONFIRMED_MATCH"
                    : r.type,
              }
            : r,
        ),
      };
    case "addRelationship":
      return {
        ...state,
        relationships: [...state.relationships, action.relationship],
      };
    case "addReminder":
      return { ...state, reminders: [...state.reminders, action.reminder] };
    case "toggleReminder":
      return {
        ...state,
        reminders: state.reminders.map((r) =>
          r.id === action.id
            ? { ...r, status: r.status === "DONE" ? "SCHEDULED" : "DONE" }
            : r,
        ),
      };
    case "deleteReminder":
      return {
        ...state,
        reminders: state.reminders.filter((r) => r.id !== action.id),
      };
    case "setLanguage":
      return { ...state, language: action.language };
    case "invite":
      return { ...state, shares: [...state.shares, action.share] };
    case "revokeShare":
      return {
        ...state,
        shares: state.shares.filter((s) => s.id !== action.id),
      };
    case "toast":
      return { ...state, toast: { id: action.id, text: action.text } };
    case "clearToast":
      return { ...state, toast: null };
    case "reset":
      return initialState;
  }
}

const StoreContext = createContext<{
  state: State;
  dispatch: Dispatch<Action>;
} | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const busy = state.docs.some(
    (d) => PROCESSING_LIFECYCLES.has(d.lifecycle) && !d.askCategory,
  );
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => dispatch({ type: "tick" }), 1600);
    return () => clearInterval(t);
  }, [busy]);

  useEffect(() => {
    if (!state.toast) return;
    const t = setTimeout(() => dispatch({ type: "clearToast" }), 3200);
    return () => clearTimeout(t);
  }, [state.toast]);

  return (
    <StoreContext.Provider value={{ state, dispatch }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore must be used inside StoreProvider");
  return ctx;
}

export function useDoc(id: string): ProtoDoc | undefined {
  return useStore().state.docs.find((d) => d.id === id);
}

export function useToast() {
  const { dispatch } = useStore();
  return (text: string) => dispatch({ type: "toast", text, id: Date.now() });
}

export function reminderFor(
  docId: string,
  title: string,
  dueAt: string,
  daysBefore: number,
  id: string,
): Reminder {
  return {
    id,
    docId,
    title,
    dueAt,
    remindAt: shiftDate(dueAt, -daysBefore),
    status: "SCHEDULED",
  };
}
