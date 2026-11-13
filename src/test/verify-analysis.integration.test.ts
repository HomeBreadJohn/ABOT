/**
 * LIVE Lumen verification for the ~2000-char message-length fix.
 *
 * The documented 4000-char cap is wrong: the real AI Chat gateway returns
 * 400 AI_CHAT_QUERY_TOO_LONG above ~2000 chars (binary-searched: 2000 -> 200,
 * 2016 -> 400). This test proves that a realistic chunk prompt now fits:
 *
 *   1. A built chunk prompt carrying ~900 chars of utility-bill text POSTs to
 *      the live message endpoint and returns 200 (not 400).
 *   2. The full HybridAnalysisEngine runs against a small fictional bill and
 *      either produces a real AnalysisResult or (if the blank instance's scope
 *      guard refuses content) degrades to a clean INVALID_ANALYSIS — which
 *      means length is fixed and the only remaining blocker is the instance.
 *
 * Excluded from the default `npm run test` by the `.integration.test.ts`
 * suffix. Run explicitly:
 *
 *   npx vitest run src/test/verify-analysis.integration.test.ts
 *
 * A raw vitest process does NOT get Next's injected env, so this file loads
 * `.env.local` into process.env itself before importing any server module.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

function loadEnvLocal(): void {
  const file = path.resolve(__dirname, "../../.env.local");
  let raw: string;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(`.env.local not found at ${file}; cannot run live test.`);
  }
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

/** ~900 chars of plausible utility-bill content for a realistic chunk. */
const BILL_TEXT = [
  "[p1] SAMPLE ELECTRIC COOPERATIVE - Monthly Statement of Account.",
  "Account Name: Juan Dela Cruz. Account Number: 0000-1234-5678.",
  "Service Address: 123 Mabini Street, Anytown.",
  "Billing Period: October 1 to October 31, 2026.",
  "Previous Reading: 1200 kWh. Present Reading: 1550 kWh. Consumption: 350 kWh.",
  "Generation Charge: PHP 1,480.00. Transmission Charge: PHP 210.00.",
  "Distribution Charge: PHP 420.00. System Loss Charge: PHP 180.00.",
  "Government Taxes: PHP 160.00. Total Amount Due: PHP 2,450.00.",
  "Due Date: November 20, 2026.",
  "A 2 percent surcharge applies to payments made after the due date.",
  "Disconnection may follow non-payment after the due date.",
  "Please pay at any authorized payment center or through online banking.",
].join("\n");

const UTILITIES_GUIDANCE =
  "This is a utility bill. Explain the billing breakdown, consumption, due dates, and penalties. Quote exact amounts and dates; do not estimate.";

describe("LIVE Lumen: analysis message length fix", () => {
  let getChatProvider: typeof import("@/lib/providers").getChatProvider;
  let getProviderEnv: typeof import("@/lib/env/server").getProviderEnv;
  let buildChunkAnalysisPrompt: typeof import("@/features/intelligence/prompts/chunk-analysis").buildChunkAnalysisPrompt;
  let HybridAnalysisEngine: typeof import("@/features/intelligence/services/hybrid-engine").HybridAnalysisEngine;
  let CHAT_MESSAGE_MAX_LENGTH: number;

  beforeAll(async () => {
    getProviderEnv = (await import("@/lib/env/server")).getProviderEnv;
    getChatProvider = (await import("@/lib/providers")).getChatProvider;
    buildChunkAnalysisPrompt = (
      await import("@/features/intelligence/prompts/chunk-analysis")
    ).buildChunkAnalysisPrompt;
    HybridAnalysisEngine = (
      await import("@/features/intelligence/services/hybrid-engine")
    ).HybridAnalysisEngine;
    CHAT_MESSAGE_MAX_LENGTH = (
      await import("@/lib/providers/chat-provider")
    ).CHAT_MESSAGE_MAX_LENGTH;
  });

  it("guards: env is loaded and provider mode is lumen", () => {
    expect(getProviderEnv().mode).toBe("lumen");
  });

  it(
    "a realistic chunk prompt fits the real cap and the live gateway accepts it (200, not 400)",
    async () => {
      const prompt = buildChunkAnalysisPrompt(BILL_TEXT, UTILITIES_GUIDANCE);

      console.log(
        `[LIVE] chunk prompt length=${prompt.length} cap=${CHAT_MESSAGE_MAX_LENGTH} ` +
          `billTextLength=${BILL_TEXT.length}`,
      );
      // The whole built message must be within the real cap before we even send.
      expect(prompt.length).toBeLessThanOrEqual(CHAT_MESSAGE_MAX_LENGTH);

      const chat = getChatProvider();
      const { sessionId } = await chat.openSession();

      // The pre-fix 3600-char message tripped AI_CHAT_QUERY_TOO_LONG here. If
      // this resolves at all, the gateway returned 200 (lumenRequest throws on
      // 400). The reply content may still be a scope-guard refusal — that is a
      // separate, instance-config blocker, not a length failure.
      const { reply } = await chat.send(sessionId, prompt);

      console.log(
        `[LIVE] message accepted (200). replyLength=${reply.length} ` +
          `replyHead=${JSON.stringify(reply.slice(0, 160))}`,
      );
      expect(typeof reply).toBe("string");
    },
    120_000,
  );

  it(
    "full engine on a small fictional bill: real AnalysisResult, or clean instance-refusal",
    async () => {
      const pages = [
        { pageNumber: 1, status: "READY" as const, text: BILL_TEXT, words: [], averageConfidence: 0.95 },
      ];

      const chat = getChatProvider();
      const engine = new HybridAnalysisEngine(chat);

      let outcome = "";
      let errorCode = "";
      let category = "";
      let overviewLength = 0;
      let findingCount = 0;
      try {
        const res = await engine.analyze({
          documentId: "00000000-0000-0000-0000-000000000000",
          pages,
          corrections: [],
          language: "EN",
        });
        outcome = res.outcome;
        category = res.result.document.documentType;
        overviewLength = res.result.overview.length;
        findingCount =
          res.result.keyInformation.length +
          res.result.obligations.length +
          res.result.watchouts.length +
          res.result.consequences.length +
          res.result.nextSteps.length +
          res.result.importantDates.length;
      } catch (e) {
        errorCode = (e as { code?: string }).code ?? (e as Error).name ?? "unknown";
      }

      console.log(
        `[LIVE] engine outcome=${outcome || "(threw)"} errorCode=${errorCode || "(none)"} ` +
          `category=${category || "(n/a)"} overviewLength=${overviewLength} findings=${findingCount}`,
      );

      if (outcome === "COMPLETED" && findingCount > 0) {
        expect(category).toBeTruthy();
        expect(overviewLength).toBeGreaterThan(0);
        return;
      }
      // Length is fixed; the remaining blocker is the instance refusing content,
      // which the engine surfaces as a clean INVALID_ANALYSIS.
      expect(errorCode).toBe("INVALID_ANALYSIS");
    },
    180_000,
  );
});
