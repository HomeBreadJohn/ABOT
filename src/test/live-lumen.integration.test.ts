/**
 * LIVE Lumen integration test — the first real end-to-end round-trip against
 * staging. Proves the real OCR read works, and probes the real AI Chat analysis
 * engine against the blank "PLP-Hackathon-Blank" instance.
 *
 * Excluded from the default `npm run test` by the `.integration.test.ts`
 * suffix. Run it explicitly:
 *
 *   npx vitest run src/test/live-lumen.integration.test.ts
 *
 * A raw vitest process does NOT get Next's injected env, so this file loads
 * `.env.local` into process.env itself before importing any server module.
 * No real PII: the uploaded document is a fictional utility bill.
 *
 * FINDING (2026-11-13): Real OCR works (a generated fictional PDF reads READY
 * with real text). The AI analysis CANNOT complete against this instance: the
 * blank "PLP-Hackathon-Blank" instance returns a canned refusal — "That
 * question is outside what this assistant covers." — for every message that
 * carries concrete document data, and refuses some in-scope educational
 * questions non-deterministically. 25+ prompt variations (imperative vs.
 * question, persona priming, two-turn priming, JSON vs. prose, data fences,
 * length, newlines) all failed. This is an instance-side scope guard, not a
 * mismatch in our client/schema/prompts/contract: the engine builds valid
 * prompts, sends them correctly, and degrades safely (classify falls back to
 * OTHER, chunk analysis returns null, the engine throws a clean INVALID_ANALYSIS
 * AppError). Unblocking requires a persona-configured AI instance, not a code
 * change here. The AI case is therefore a diagnostic that records the real
 * outcome; it does not fake a pass.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";

// ---- env bootstrap (must run before the server modules read process.env) ----
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
    // Do not clobber an env var the shell already set.
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadEnvLocal();

/**
 * A minimal single-page PDF with a real text layer describing a fictional
 * utility bill. Built by hand so the test needs no PDF dependency. Each line is
 * written with its own newline (T*); the xref byte offsets are computed from the
 * assembled body so the file is structurally valid and Lumen OCR reads it.
 */
function buildFictionalBillPdf(): Uint8Array {
  const lines = [
    "SAMPLE ELECTRIC COOPERATIVE",
    "Monthly Statement of Account",
    "Account Name: Juan Dela Cruz",
    "Account Number: 0000-1234-5678",
    "Service Address: 123 Mabini Street, Anytown",
    "Billing Period: October 1 to October 31, 2026",
    "Previous Reading: 1200 kWh   Present Reading: 1550 kWh",
    "Consumption: 350 kWh",
    "Amount Due: PHP 2,450.00",
    "Due Date: November 20, 2026",
    "A 2 percent surcharge applies to late payments.",
    "Disconnection may follow non-payment after the due date.",
  ];
  const escape = (s: string) => s.replace(/\\/g, "\\\\").replace(/[()]/g, "\\$&");
  let text = "BT\n/F1 11 Tf\n50 760 Td\n14 TL\n";
  for (const line of lines) {
    text += `(${escape(line)}) Tj\nT*\n`;
  }
  text += "ET";

  const objs: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];

  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });

  const xrefStart = body.length;
  let xref = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return new TextEncoder().encode(body + xref + trailer);
}

const DELAY_MS = 3_000;
const MAX_POLLS = 40;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type NormalizedPage = import("@/lib/providers/ocr-provider").NormalizedPage;

describe("LIVE Lumen end-to-end (real staging round-trip)", () => {
  // Imports resolve the real server modules through the "@/" alias and the
  // server-only stub. They are dynamic so env is loaded first.
  let getProviderEnv: typeof import("@/lib/env/server").getProviderEnv;
  let LumenOcrProvider: typeof import("@/lib/lumen/ocr-client").LumenOcrProvider;
  let getChatProvider: typeof import("@/lib/providers").getChatProvider;
  let HybridAnalysisEngine: typeof import("@/features/intelligence/services/hybrid-engine").HybridAnalysisEngine;

  // Carries the real OCR pages from the OCR test into the AI diagnostic.
  const captured: { pages: NormalizedPage[] } = { pages: [] };

  beforeAll(async () => {
    getProviderEnv = (await import("@/lib/env/server")).getProviderEnv;
    LumenOcrProvider = (await import("@/lib/lumen/ocr-client")).LumenOcrProvider;
    getChatProvider = (await import("@/lib/providers")).getChatProvider;
    HybridAnalysisEngine = (
      await import("@/features/intelligence/services/hybrid-engine")
    ).HybridAnalysisEngine;
  });

  it("guards: env is loaded and provider mode is lumen", () => {
    expect(getProviderEnv().mode).toBe("lumen");
  });

  it(
    "reads a fictional bill via real OCR (generated PDF) and returns real text",
    async () => {
      const ocr = new LumenOcrProvider();
      const filename = `fictional-bill-${Date.now()}.pdf`;
      const bytes = buildFictionalBillPdf();

      const { providerDocumentId } = await ocr.submit({
        bytes,
        mimeType: "application/pdf",
        filename,
      });

      let finalStatus = "";
      for (let i = 0; i < MAX_POLLS; i++) {
        const { status } = await ocr.getStatus(providerDocumentId);
        finalStatus = status;
        if (status === "READY" || status === "PARTIAL" || status === "FAILED") break;
        await sleep(DELAY_MS);
      }

      expect(["READY", "PARTIAL"]).toContain(finalStatus);

      const pages = await ocr.getPages(providerDocumentId);
      captured.pages = pages;
      const totalText = pages.map((p) => p.text).join(" ").trim();

      // eslint-disable-next-line no-console
      console.log(
        `[LIVE] OCR path=a-generated-pdf status=${finalStatus} pages=${pages.length} ` +
          `textSnippetLength=${Math.min(totalText.length, 120)} totalTextLength=${totalText.length}`,
      );

      expect(pages.length).toBeGreaterThan(0);
      // Real OCR read the fictional values back out of the generated PDF.
      expect(totalText.length).toBeGreaterThan(0);
      expect(totalText).toContain("2,450.00");
    },
    180_000,
  );

  // Diagnostic (not a hard pass): the blank instance's scope guard refuses
  // concrete-document analysis, so the hybrid engine cannot complete. This
  // records the real outcome without faking a pass. See the file header.
  it(
    "AI analysis against the blank instance: records the real outcome (instance-guard blocker)",
    async () => {
      if (captured.pages.length === 0) {
        // eslint-disable-next-line no-console
        console.log("[LIVE] AI: no OCR pages captured; skipping AI diagnostic.");
        return;
      }

      const chat = getChatProvider();
      const engine = new HybridAnalysisEngine(chat);

      let outcome = "";
      let errorCode = "";
      let overviewLength = 0;
      let findingCount = 0;
      let category = "";
      try {
        const res = await engine.analyze({
          documentId: "00000000-0000-0000-0000-000000000000",
          pages: captured.pages,
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
        errorCode =
          (e as { code?: string }).code ?? (e as Error).name ?? "unknown";
      }

      // eslint-disable-next-line no-console
      console.log(
        `[LIVE] AI outcome=${outcome || "(threw)"} errorCode=${errorCode || "(none)"} ` +
          `category=${category || "(n/a)"} overviewLength=${overviewLength} findings=${findingCount}`,
      );

      if (outcome === "COMPLETED" && findingCount > 0) {
        // If a persona-configured instance ever replaces the blank one, the
        // real pipeline genuinely completed.
        expect(category).toBeTruthy();
        expect(overviewLength).toBeGreaterThan(0);
        return;
      }

      // Known blocker: the blank instance refuses concrete-document analysis,
      // so the engine throws a clean INVALID_ANALYSIS. The engine's safe
      // degradation IS the correct behavior here; assert exactly that.
      expect(errorCode).toBe("INVALID_ANALYSIS");
    },
    180_000,
  );
});
