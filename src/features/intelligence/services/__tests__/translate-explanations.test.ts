import { describe, expect, it, vi } from "vitest";

import { mockUtilityBillAnalysis, type AnalysisResult } from "@/contracts";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import {
  makeTranslateHandler,
  translateAnalysis,
  type TranslateJobDeps,
} from "@/features/intelligence/services/translate-explanations";
import type { ClaimedJob } from "@/features/processing/services/job-registry";

/** The text fields the translator is allowed to change. */
function collectText(result: AnalysisResult): string[] {
  const out = [result.overview, result.explanation];
  const lists = [
    result.keyInformation,
    result.obligations,
    result.watchouts,
    result.consequences,
    result.nextSteps,
    result.importantDates,
    ...result.specializedSections.map((s) => s.items),
  ];
  for (const list of lists)
    for (const f of list) out.push(f.title, f.explanation);
  return out;
}

/**
 * A chat that echoes back the fields payload with every string reversed, so the
 * translation differs from the source but changes no numbers or dates.
 */
function reversingChat(): MockChatProvider {
  const chat = new MockChatProvider();
  chat.respondWith(
    () => true,
    "", // replaced below by the dynamic responder
  );
  // MockChatProvider uses fixed replies, so override send for a dynamic echo.
  (chat as unknown as { send: ChatSend }).send = async (
    _sessionId: string,
    message: string,
  ) => {
    const match = message.match(/<<<\s*([\s\S]*?)\s*>>>/);
    const fields = match ? JSON.parse(match[1]) : {};
    const translated: Record<string, string> = {};
    for (const [k, v] of Object.entries(fields)) {
      translated[k] = reverseWords(String(v));
    }
    return { reply: JSON.stringify(translated) };
  };
  return chat;
}

type ChatSend = (sessionId: string, message: string) => Promise<{ reply: string }>;

/** Reverse letters within each word, leaving numbers and punctuation in place. */
function reverseWords(s: string): string {
  return s.replace(/[A-Za-z]+/g, (w) => [...w].reverse().join(""));
}

/** A deep clone with every translatable text field blanked, for structural equality. */
function stripText(result: AnalysisResult): AnalysisResult {
  const clone = structuredClone(result);
  clone.overview = "";
  clone.explanation = "";
  const blank = (f: { title: string; explanation: string }) => {
    f.title = "";
    f.explanation = "";
  };
  for (const list of [
    clone.keyInformation,
    clone.obligations,
    clone.watchouts,
    clone.consequences,
    clone.nextSteps,
    clone.importantDates,
  ])
    for (const f of list) blank(f);
  for (const s of clone.specializedSections) for (const i of s.items) blank(i);
  return clone;
}

describe("translateAnalysis", () => {
  it("translates only the four text-field kinds and leaves everything else byte-for-byte", async () => {
    const source = mockUtilityBillAnalysis;
    const chat = reversingChat();

    const { result, limitationAdded } = await translateAnalysis(
      source,
      "FIL",
      chat,
    );

    expect(limitationAdded).toBe(false);

    // Non-text fields unchanged: strip text and compare the rest.
    expect(stripText(result)).toEqual(stripText(source));

    // Text fields actually changed (reversed), none equal to the source.
    const before = collectText(source);
    const after = collectText(result);
    expect(after).toHaveLength(before.length);
    for (let i = 0; i < before.length; i++) {
      if (/[A-Za-z]/.test(before[i])) expect(after[i]).not.toBe(before[i]);
    }

    // Dates and amounts preserved verbatim.
    expect(result.importantDates[0].date).toBe(source.importantDates[0].date);
    expect(result.importantDates[0].dateText).toBe(
      source.importantDates[0].dateText,
    );
    expect(result.evidence).toEqual(source.evidence);
    expect(result.analysisMetadata).toEqual(source.analysisMetadata);
  });

  it("rejects a translation that alters a number or date, retries once, then falls back with a limitation", async () => {
    const source = mockUtilityBillAnalysis;
    const chat = new MockChatProvider();
    // Both attempts corrupt the amount inside a translated string.
    let calls = 0;
    (chat as unknown as { send: ChatSend }).send = async (
      _s: string,
      message: string,
    ) => {
      calls++;
      const match = message.match(/<<<\s*([\s\S]*?)\s*>>>/);
      const fields = match ? JSON.parse(match[1]) : {};
      const translated: Record<string, string> = {};
      for (const [k, v] of Object.entries(fields)) {
        translated[k] = String(v).replace(/2,450\.00/g, "9,999.00");
      }
      return { reply: JSON.stringify(translated) };
    };

    const { result, limitationAdded } = await translateAnalysis(
      source,
      "FIL",
      chat,
    );

    // Two attempts (initial + one retry), both rejected.
    expect(calls).toBe(2);
    expect(limitationAdded).toBe(true);
    // Falls back to the source text, unchanged.
    expect(collectText(result)).toEqual(collectText(source));
    expect(result.limitations.some((l) => /translation/i.test(l))).toBe(true);
  });

  it("never translates EN (the source language)", async () => {
    const chat = new MockChatProvider();
    const spy = vi.spyOn(chat, "send");
    const { result } = await translateAnalysis(
      mockUtilityBillAnalysis,
      "EN",
      chat,
    );
    expect(spy).not.toHaveBeenCalled();
    expect(result).toEqual(mockUtilityBillAnalysis);
  });
});

function job(overrides: Partial<ClaimedJob> = {}): ClaimedJob {
  return {
    id: "job-1",
    documentId: "doc-1",
    userId: "user-1",
    jobType: "TRANSLATE",
    step: null,
    payload: { analysisId: "analysis-1", language: "FIL" },
    attempts: 1,
    maxAttempts: 5,
    ...overrides,
  };
}

describe("TRANSLATE job handler and getAnalysisInLanguage", () => {
  function fakeStore() {
    const rows = new Map<string, AnalysisResult>();
    const deps: TranslateJobDeps = {
      loadSource: vi.fn(async () => mockUtilityBillAnalysis),
      loadCached: vi.fn(async (analysisId: string, language: string) =>
        rows.get(`${analysisId}:${language}`) ?? null,
      ),
      saveTranslation: vi.fn(
        async (analysisId: string, language: string, result: AnalysisResult) => {
          rows.set(`${analysisId}:${language}`, result);
        },
      ),
      chat: reversingChat(),
    };
    return { deps, rows };
  }

  it("translates once and caches; a second run sends zero messages", async () => {
    const { deps, rows } = fakeStore();
    const sendSpy = vi.spyOn(deps.chat, "send");

    const first = await makeTranslateHandler(deps)(job(), {});
    expect(first.kind).toBe("done");
    expect(rows.has("analysis-1:FIL")).toBe(true);
    const firstCalls = sendSpy.mock.calls.length;
    expect(firstCalls).toBeGreaterThan(0);

    // Second request for the same pair: the handler serves from cache.
    const second = await makeTranslateHandler(deps)(job(), {});
    expect(second.kind).toBe("done");
    expect(sendSpy.mock.calls.length).toBe(firstCalls); // no new messages
  });
});
