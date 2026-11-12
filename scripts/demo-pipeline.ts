/**
 * Demo: run the real analysis pipeline in-process, mock mode, zero credits.
 *
 * This is a presentation script, not product code. It drives the actual
 * engine chain — mock OCR pages -> HybridAnalysisEngine (classify, per-chunk
 * analysis, consolidate) -> evidence mapping -> safety rules -> review
 * requirements -> contract validation — and prints the resulting report.
 *
 * It makes NO network calls and needs NO database: the chat provider is the
 * deterministic MockChatProvider and the OCR pages are the committed fixture.
 *
 * Run:  npx tsx scripts/demo-pipeline.ts
 *   (or) npx vitest run scripts/demo-pipeline.ts   // if wrapped as a test
 */
import { parseAnalysisResult, type AnalysisResult } from "@/contracts";
import { utilityBillPages } from "@/lib/providers/mock/fixtures/utility-bill-pages";
import { MockChatProvider } from "@/lib/providers/mock/mock-chat-provider";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";

const DOCUMENT_ID = "demo-doc-0001";

/** Script the mock assistant so the hybrid engine produces a real report. */
function buildChat(): MockChatProvider {
  const chat = new MockChatProvider();

  // 1) classify.ts asks for a category JSON object.
  chat.respondWith(
    (m) => m.includes("classify") || m.includes('"category"'),
    JSON.stringify({
      category: "UTILITIES",
      subtype: "Electricity bill",
      issuer: "Sample Electric Cooperative",
      confidence: 0.93,
      candidates: [
        { category: "UTILITIES", confidence: 0.93 },
        { category: "FINANCIAL", confidence: 0.2 },
      ],
    }),
  );

  // 2) per-chunk analysis: candidate findings with quote + page. The quotes are
  // exact substrings of the fixture OCR text so evidence mapping resolves them.
  chat.respondWith(
    (m) => m.includes("DATA:") && m.includes("[p1]"),
    JSON.stringify({
      findings: [
        {
          type: "KEY_INFORMATION",
          title: "Amount due",
          explanation: "The bill states the total amount payable.",
          informationStatus: "FOUND",
          confidence: 0.95,
          basis: "Stated on the bill.",
          quote: "Amount Due: PHP 2,450.00",
          page: 1,
        },
        {
          type: "IMPORTANT_DATE",
          title: "Payment due date",
          explanation: "The date by which payment must be made.",
          informationStatus: "FOUND",
          confidence: 0.95,
          basis: "Stated on the bill.",
          quote: "Due Date: December 15, 2026",
          page: 1,
        },
        {
          type: "WATCHOUT",
          title: "Late-payment surcharge",
          explanation: "A surcharge applies if payment is late.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Stated on the bill.",
          quote: "A surcharge applies to payments after the due date.",
          page: 2,
        },
      ],
    }),
  );

  // 3) consolidation: overview + explanation.
  chat.respondWith(
    (m) => m.toLowerCase().includes("consolidate"),
    JSON.stringify({
      overview: "This is an electricity bill from Sample Electric Cooperative.",
      explanation:
        "It shows PHP 2,450.00 due by December 15, 2026, with a surcharge for late payment.",
    }),
  );

  return chat;
}

function heading(text: string): void {
  console.log(`\n${"=".repeat(64)}\n${text}\n${"=".repeat(64)}`);
}

function printFindings(label: string, list: AnalysisResult["keyInformation"]): void {
  if (list.length === 0) return;
  console.log(`\n${label}:`);
  for (const f of list) {
    const ev = f.evidenceIds.length
      ? `  [evidence: ${f.evidenceIds.join(", ")}]`
      : "  [no evidence]";
    console.log(
      `  - ${f.title} (${f.informationStatus}, confidence ${f.confidence})${ev}`,
    );
    console.log(`      ${f.explanation}`);
  }
}

async function main(): Promise<void> {
  heading("Kalinga document intelligence — mock-mode pipeline demo");
  console.log(
    `Document: ${DOCUMENT_ID}\nOCR pages (mock): ${utilityBillPages.length}\nProvider mode: mock (no network, no credits)`,
  );

  const engine = new RealAnalysisEngine(buildChat());

  heading("Running: classify -> per-chunk analysis -> consolidate -> evidence -> safety -> review");
  const { result, outcome } = await engine.analyze({
    documentId: DOCUMENT_ID,
    pages: utilityBillPages,
    corrections: [],
    language: "EN",
  });

  // Prove the report satisfies the shared contract, just like the real job does.
  const validated = parseAnalysisResult(result, { documentId: DOCUMENT_ID });

  heading("Analysis report");
  console.log(`Document type : ${validated.document.documentType}`);
  console.log(`Subtype       : ${validated.document.documentSubtype ?? "-"}`);
  console.log(`Issuer        : ${validated.document.issuer ?? "-"}`);
  console.log(`Overview      : ${validated.overview}`);
  console.log(`Explanation   : ${validated.explanation}`);

  printFindings("Key information", validated.keyInformation);
  printFindings("Important dates", validated.importantDates);
  printFindings("Watch-outs", validated.watchouts);
  printFindings("Obligations", validated.obligations);
  printFindings("Next steps", validated.nextSteps);

  if (validated.evidence.length) {
    console.log(`\nEvidence (rebuilt from OCR words, never the AI's quote):`);
    for (const e of validated.evidence) {
      console.log(
        `  - ${e.id}: page ${e.pageNumber} words ${e.wordStart}-${e.wordEnd} ` +
          `(match ${e.matchConfidence}, ${e.sourceType}) "${e.excerpt}"`,
      );
    }
  }

  if (validated.reviewRequirements.length) {
    console.log(`\nReview requirements:`);
    for (const r of validated.reviewRequirements) {
      console.log(`  - [${r.reviewStatus}/${r.impactLevel}] ${r.field}: ${r.reason}`);
    }
  }

  if (validated.limitations.length) {
    console.log(`\nLimitations:`);
    for (const l of validated.limitations) console.log(`  - ${l}`);
  }

  heading("Outcome");
  console.log(`Engine outcome: ${outcome}`);
  console.log(
    `Schema validated: yes (parseAnalysisResult passed)\n` +
      `Analysis version: ${validated.analysisMetadata.analysisVersion}\n`,
  );
}

main().catch((error) => {
  console.error("Demo failed:", error);
  process.exitCode = 1;
});
