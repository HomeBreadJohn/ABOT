/**
 * Hallucination evaluation (plan B24, mock mode only — ZERO live Lumen calls).
 *
 * For one FICTIONAL document per category, drive the real analysis engine with
 * the deterministic MockChatProvider and assert the two anti-hallucination
 * guarantees:
 *
 *   1. Every FOUND finding's evidence excerpt is rebuilt from the OCR text
 *      (evidence-mapping returns the OCR span, never the AI's quote), so a
 *      FOUND finding can never carry invented evidence.
 *   2. The one field deliberately absent from each document is never reported
 *      as a FOUND finding with mapped evidence — it is either omitted entirely
 *      or reported without evidence (NOT_FOUND/absent), never invented.
 *
 * All fixtures are fictional. No real personal data, no real issuers, and no
 * claim any of this came from Lumen.
 */
import { describe, expect, it } from "vitest";

import { parseAnalysisResult, type Finding } from "@/contracts";
import type { DocumentCategory } from "@/contracts/common";
import type { NormalizedPage } from "@/lib/providers/ocr-provider";
import type { ChunkFinding } from "@/features/intelligence/services/chunk-analysis-schema";
import { MockChatProvider } from "@/lib/providers";
import { RealAnalysisEngine } from "@/features/intelligence/services/real-analysis-engine";

// --- fixture types and helpers -------------------------------------------

type EvalFixture = {
  category: DocumentCategory;
  documentId: string;
  pages: NormalizedPage[];
  classification: {
    category: DocumentCategory;
    subtype: string;
    issuer: string;
    confidence: number;
    candidates: { category: DocumentCategory; confidence: number }[];
  };
  findings: ChunkFinding[];
  consolidation: { overview: string; explanation: string };
  expectedKeyFacts: string[];
  missingField: string;
};

function toPage(pageNumber: number, text: string, confidence = 0.95): NormalizedPage {
  const words = text
    .split(/\s+/)
    .filter(Boolean)
    .map((word, index) => ({ index, text: word, confidence }));
  return {
    pageNumber,
    status: "READY",
    text,
    words,
    averageConfidence: words.length === 0 ? null : confidence,
  };
}

/** Normalize the same way evidence-mapping does, for substring checks. */
function normalize(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Script the mock chat with this fixture's classify/chunk/consolidate replies. */
function scriptChat(fixture: EvalFixture): MockChatProvider {
  const chat = new MockChatProvider();
  chat.respondWith(
    (m) => m.includes("Classify a document"),
    JSON.stringify(fixture.classification),
  );
  chat.respondWith(
    (m) => m.includes("per-chunk analysis"),
    JSON.stringify({ findings: fixture.findings }),
  );
  chat.respondWith(
    (m) => m.includes("Consolidate these findings"),
    JSON.stringify(fixture.consolidation),
  );
  return chat;
}

/** Every finding across the report's finding lists. */
function allFindings(result: {
  keyInformation: Finding[];
  obligations: Finding[];
  watchouts: Finding[];
  consequences: Finding[];
  nextSteps: Finding[];
  importantDates: Finding[];
}): Finding[] {
  return [
    ...result.keyInformation,
    ...result.obligations,
    ...result.watchouts,
    ...result.consequences,
    ...result.nextSteps,
    ...result.importantDates,
  ];
}

// --- the nine fictional fixtures, one per category ------------------------

const FIXTURES: EvalFixture[] = [
  {
    category: "GOVERNMENT",
    documentId: "e0000001-0000-0000-0000-000000000001",
    pages: [
      toPage(
        1,
        [
          "Barangay Maligaya Clearance Certificate",
          "Reference No: BRGY-2026-004821",
          "Issued To: Juan Dela Cruz",
          "Valid Until: March 30, 2027",
          "Purpose: Local employment requirement",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "GOVERNMENT",
      subtype: "Barangay clearance",
      issuer: "Barangay Maligaya",
      confidence: 0.95,
      candidates: [{ category: "GOVERNMENT", confidence: 0.95 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Reference number",
        explanation: "The clearance reference number is recorded.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Header line of the certificate.",
        quote: "Reference No: BRGY-2026-004821",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Validity date",
        explanation: "The clearance is valid until the stated date.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Validity line.",
        quote: "Valid Until: March 30, 2027",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A barangay clearance certificate for a named resident.",
      explanation: "This certificate confirms local clearance and its validity date.",
    },
    expectedKeyFacts: ["BRGY-2026-004821", "March 30, 2027"],
    // No official dry seal / embossed security mark text appears in the OCR.
    missingField: "official dry seal verification code",
  },
  {
    category: "FINANCIAL",
    documentId: "e0000002-0000-0000-0000-000000000002",
    pages: [
      toPage(
        1,
        [
          "Northfield Community Credit Union",
          "Monthly Statement",
          "Account Ending: 4417",
          "Statement Balance: PHP 18,450.75",
          "Minimum Payment Due: PHP 1,200.00",
          "Payment Due Date: January 20, 2027",
          "Interest Rate (APR): 24 percent",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "FINANCIAL",
      subtype: "Credit statement",
      issuer: "Northfield Community Credit Union",
      confidence: 0.94,
      candidates: [{ category: "FINANCIAL", confidence: 0.94 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Statement balance",
        explanation: "The outstanding statement balance is stated.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Balance line.",
        quote: "Statement Balance: PHP 18,450.75",
        page: 1,
      },
      {
        type: "WATCHOUT",
        title: "Interest rate",
        explanation: "The annual interest rate applies to carried balances.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "APR line.",
        quote: "Interest Rate (APR): 24 percent",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A monthly credit statement from a credit union.",
      explanation: "This statement shows your balance, minimum payment, and interest rate.",
    },
    expectedKeyFacts: ["PHP 18,450.75", "January 20, 2027", "24 percent"],
    // No late-payment penalty amount is printed anywhere on the statement.
    missingField: "late payment penalty amount",
  },
  {
    category: "EMPLOYMENT",
    documentId: "e0000003-0000-0000-0000-000000000003",
    pages: [
      toPage(
        1,
        [
          "Brightpath Solutions Inc.",
          "Offer of Employment",
          "Position: Junior Systems Analyst",
          "Monthly Salary: PHP 42,000.00",
          "Start Date: February 2, 2027",
          "Probationary Period: 6 months",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "EMPLOYMENT",
      subtype: "Job offer letter",
      issuer: "Brightpath Solutions Inc.",
      confidence: 0.93,
      candidates: [{ category: "EMPLOYMENT", confidence: 0.93 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Monthly salary",
        explanation: "The offered monthly salary is stated.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Salary line.",
        quote: "Monthly Salary: PHP 42,000.00",
        page: 1,
      },
      {
        type: "OBLIGATION",
        title: "Probationary period",
        explanation: "Employment begins with a probationary period.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Probation line.",
        quote: "Probationary Period: 6 months",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A job offer letter from a private company.",
      explanation: "This letter offers a position with a salary, start date, and probation terms.",
    },
    expectedKeyFacts: ["PHP 42,000.00", "February 2, 2027", "6 months"],
    // No 13th-month pay clause is written in the offer.
    missingField: "13th month pay clause",
  },
  {
    category: "LEGAL",
    documentId: "e0000004-0000-0000-0000-000000000004",
    pages: [
      toPage(
        1,
        [
          "Residential Lease Agreement",
          "Lessor: Maple Grove Properties",
          "Lessee: Ana Reyes",
          "Monthly Rent: PHP 15,000.00",
          "Security Deposit: PHP 30,000.00",
          "Lease Term: 12 months beginning April 1, 2027",
          "Late payment incurs a penalty after the 5th day.",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "LEGAL",
      subtype: "Lease agreement",
      issuer: "Maple Grove Properties",
      confidence: 0.92,
      candidates: [{ category: "LEGAL", confidence: 0.92 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Monthly rent",
        explanation: "The monthly rent amount is stated.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Rent line.",
        quote: "Monthly Rent: PHP 15,000.00",
        page: 1,
      },
      {
        type: "WATCHOUT",
        title: "Late payment penalty",
        explanation: "A penalty applies to late rent.",
        informationStatus: "FOUND",
        confidence: 0.85,
        basis: "Penalty clause.",
        quote: "Late payment incurs a penalty after the 5th day.",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A residential lease agreement between a lessor and a lessee.",
      explanation: "This lease sets the rent, deposit, term, and a late-payment penalty.",
    },
    expectedKeyFacts: ["PHP 15,000.00", "PHP 30,000.00", "12 months"],
    // The exact penalty percentage/amount is not stated, only that one applies.
    missingField: "exact late payment penalty amount",
  },
  {
    category: "MEDICAL",
    documentId: "e0000005-0000-0000-0000-000000000005",
    pages: [
      toPage(
        1,
        [
          "Lakeside Family Clinic",
          "Prescription",
          "Patient: Mario Santos",
          "Medication: Amoxicillin 500mg",
          "Dosage: 1 capsule three times daily",
          "Duration: 7 days",
          "Follow-up Visit: January 15, 2027",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "MEDICAL",
      subtype: "Prescription",
      issuer: "Lakeside Family Clinic",
      confidence: 0.91,
      candidates: [{ category: "MEDICAL", confidence: 0.91 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Medication and dosage",
        explanation: "The prescribed medication and dosage are stated.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Medication and dosage lines.",
        quote: "Dosage: 1 capsule three times daily",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Follow-up visit",
        explanation: "A follow-up visit date is scheduled.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Follow-up line.",
        quote: "Follow-up Visit: January 15, 2027",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A clinic prescription with a medication and a follow-up date.",
      explanation: "This prescription lists your medication, dosage, and next visit.",
    },
    expectedKeyFacts: ["Amoxicillin 500mg", "7 days", "January 15, 2027"],
    // No drug-allergy warning text appears on the prescription.
    missingField: "drug allergy warning",
  },
  {
    category: "EDUCATION",
    documentId: "e0000006-0000-0000-0000-000000000006",
    pages: [
      toPage(
        1,
        [
          "Riverside State College",
          "Statement of Account",
          "Student: Grace Lim",
          "Program: BS Information Technology",
          "Total Assessment: PHP 24,750.00",
          "Payment Deadline: February 10, 2027",
          "Enrollment Status: Officially Enrolled",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "EDUCATION",
      subtype: "Tuition statement",
      issuer: "Riverside State College",
      confidence: 0.92,
      candidates: [{ category: "EDUCATION", confidence: 0.92 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Total assessment",
        explanation: "The total tuition assessment is stated.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Assessment line.",
        quote: "Total Assessment: PHP 24,750.00",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Payment deadline",
        explanation: "Tuition is due by the stated deadline.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Deadline line.",
        quote: "Payment Deadline: February 10, 2027",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A college statement of account for a student's tuition.",
      explanation: "This statement shows your tuition assessment and payment deadline.",
    },
    expectedKeyFacts: ["PHP 24,750.00", "February 10, 2027"],
    // No scholarship/discount line is present in the statement.
    missingField: "scholarship discount",
  },
  {
    category: "UTILITIES",
    documentId: "e0000007-0000-0000-0000-000000000007",
    pages: [
      toPage(
        1,
        [
          "Sample Electric Cooperative",
          "Amount Due: PHP 2,450.00",
          "Due Date: December 15, 2026",
          "Consumption: 250 kWh",
          "A surcharge applies to payments after the due date.",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "UTILITIES",
      subtype: "Electricity bill",
      issuer: "Sample Electric Cooperative",
      confidence: 0.95,
      candidates: [{ category: "UTILITIES", confidence: 0.95 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Amount due",
        explanation: "The bill states the amount due.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Billing summary line.",
        quote: "Amount Due: PHP 2,450.00",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Due date",
        explanation: "Payment is due by the stated date.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Due date line.",
        quote: "Due Date: December 15, 2026",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A monthly electricity bill from a cooperative.",
      explanation: "This is your electricity bill with the amount due and due date.",
    },
    expectedKeyFacts: ["PHP 2,450.00", "December 15, 2026", "250 kWh"],
    // No exact surcharge amount is stated, only that one applies.
    missingField: "exact surcharge amount",
  },
  {
    category: "PERSONAL",
    documentId: "e0000008-0000-0000-0000-000000000008",
    pages: [
      toPage(
        1,
        [
          "Acknowledgment Receipt",
          "Received From: Pedro Alvarez",
          "Amount Received: PHP 5,000.00",
          "For: Partial payment of personal loan",
          "Date Received: November 3, 2026",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "PERSONAL",
      subtype: "Acknowledgment receipt",
      issuer: "Pedro Alvarez",
      confidence: 0.9,
      candidates: [{ category: "PERSONAL", confidence: 0.9 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Amount received",
        explanation: "The receipt records the amount received.",
        informationStatus: "FOUND",
        confidence: 0.9,
        basis: "Amount line.",
        quote: "Amount Received: PHP 5,000.00",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Date received",
        explanation: "The date the amount was received is recorded.",
        informationStatus: "FOUND",
        confidence: 0.88,
        basis: "Date line.",
        quote: "Date Received: November 3, 2026",
        page: 1,
      },
    ],
    consolidation: {
      overview: "An acknowledgment receipt for a partial loan payment.",
      explanation: "This receipt records who paid, how much, and when.",
    },
    expectedKeyFacts: ["PHP 5,000.00", "November 3, 2026"],
    // No remaining/outstanding balance is written on the receipt.
    missingField: "remaining loan balance",
  },
  {
    category: "OTHER",
    documentId: "e0000009-0000-0000-0000-000000000009",
    pages: [
      toPage(
        1,
        [
          "Community Hall Booking Confirmation",
          "Booked By: Sunrise Homeowners Association",
          "Event: General Assembly",
          "Reservation Date: December 20, 2026",
          "Hall: Main Function Room",
        ].join("\n"),
      ),
    ],
    classification: {
      category: "OTHER",
      subtype: "Booking confirmation",
      issuer: "Community Hall",
      confidence: 0.85,
      candidates: [{ category: "OTHER", confidence: 0.85 }],
    },
    findings: [
      {
        type: "KEY_INFORMATION",
        title: "Event",
        explanation: "The booked event is recorded.",
        informationStatus: "FOUND",
        confidence: 0.85,
        basis: "Event line.",
        quote: "Event: General Assembly",
        page: 1,
      },
      {
        type: "IMPORTANT_DATE",
        title: "Reservation date",
        explanation: "The hall is reserved for the stated date.",
        informationStatus: "FOUND",
        confidence: 0.85,
        basis: "Reservation line.",
        quote: "Reservation Date: December 20, 2026",
        page: 1,
      },
    ],
    consolidation: {
      overview: "A booking confirmation for a community hall reservation.",
      explanation: "This confirms the event, date, and room that were reserved.",
    },
    expectedKeyFacts: ["General Assembly", "December 20, 2026"],
    // No booking/reservation fee is stated on the confirmation.
    missingField: "reservation fee",
  },
];

describe("hallucination eval (mock mode, one fictional fixture per category)", () => {
  it("covers all nine categories exactly once", () => {
    const categories = FIXTURES.map((f) => f.category).sort();
    expect(categories).toEqual(
      [
        "EDUCATION",
        "EMPLOYMENT",
        "FINANCIAL",
        "GOVERNMENT",
        "LEGAL",
        "MEDICAL",
        "OTHER",
        "PERSONAL",
        "UTILITIES",
      ].sort(),
    );
  });

  for (const fixture of FIXTURES) {
    it(`${fixture.category}: FOUND evidence comes from OCR and the missing field is never invented`, async () => {
      const chat = scriptChat(fixture);
      const engine = new RealAnalysisEngine(chat);
      const { result } = await engine.analyze({
        documentId: fixture.documentId,
        pages: fixture.pages,
        corrections: [],
        language: "EN",
      });

      const validated = parseAnalysisResult(result, {
        documentId: fixture.documentId,
      });

      // The OCR text, normalized, rebuilt from the fixture pages.
      const ocrNormalized = fixture.pages.map((p) => normalize(p.text));
      const evidenceById = new Map(validated.evidence.map((e) => [e.id, e]));

      // Guarantee 1: every evidence excerpt is OCR text, and every FOUND finding
      // with evidence has that evidence drawn from the OCR (not the AI quote).
      for (const evidence of validated.evidence) {
        const page = ocrNormalized[evidence.pageNumber - 1];
        expect(page, `page ${evidence.pageNumber} exists`).toBeDefined();
        expect(
          page.includes(normalize(evidence.excerpt)),
          `excerpt "${evidence.excerpt}" is OCR text on page ${evidence.pageNumber}`,
        ).toBe(true);
        expect(evidence.sourceType).toBe("OCR_TEXT");
      }

      // Every FOUND finding that carries evidence must cite real OCR evidence.
      const founds = allFindings(validated).filter(
        (f) => f.informationStatus === "FOUND",
      );
      expect(founds.length).toBeGreaterThan(0);
      for (const finding of founds) {
        for (const id of finding.evidenceIds) {
          const evidence = evidenceById.get(id);
          expect(evidence, `evidence ${id} exists`).toBeDefined();
          const page = ocrNormalized[evidence!.pageNumber - 1];
          expect(page.includes(normalize(evidence!.excerpt))).toBe(true);
        }
      }

      // Expected key facts are present in the OCR (sanity: the fixture is
      // grounded, so a correct report is derivable from real text).
      for (const fact of fixture.expectedKeyFacts) {
        const present = ocrNormalized.some((p) => p.includes(normalize(fact)));
        expect(present, `key fact "${fact}" is in the OCR`).toBe(true);
      }

      // Guarantee 2: the deliberately missing field is never surfaced as a
      // FOUND finding with mapped evidence. It may be absent (preferred) or
      // reported as NOT_FOUND/UNCLEAR with no invented evidence.
      const missing = normalize(fixture.missingField);
      for (const finding of allFindings(validated)) {
        const mentionsMissing =
          normalize(finding.title).includes(missing) ||
          normalize(finding.explanation).includes(missing);
        if (mentionsMissing) {
          expect(
            finding.informationStatus,
            `missing field "${fixture.missingField}" must not be reported FOUND`,
          ).not.toBe("FOUND");
          // And it cannot carry fabricated evidence.
          expect(finding.evidenceIds).toEqual([]);
        }
      }

      // The missing field never appears as any evidence excerpt (not invented).
      for (const evidence of validated.evidence) {
        expect(normalize(evidence.excerpt).includes(missing)).toBe(false);
      }
    });
  }
});
