/**
 * Prototype-only sample data. Fictional documents and people.
 * Analyses are parsed through the shared contract schema so the prototype
 * stays honest to what the real engine will return.
 */
import {
  ANALYSIS_SCHEMA_VERSION,
  analysisResultSchema,
  type AnalysisResult,
} from "@/contracts/analysis";
import type {
  DocumentCategory,
  DocumentLifecycle,
  ExplanationLanguage,
  InformationStatus,
  RelationshipType,
} from "@/contracts/common";
import {
  mockNeedsCorrectionAnalysis,
  mockPartialAnalysis,
  mockUtilityBillAnalysis,
} from "@/contracts/mock-analysis";

export const TODAY = "2026-11-13";

export type PageLine = {
  text: string;
  evidenceId?: string;
  smudged?: boolean;
  tone?: "title" | "muted";
};
export type DocPage = {
  number: number;
  lines: PageLine[];
  unavailable?: boolean;
};
export type CorrectionRecord = {
  id: string;
  reviewId: string;
  field: string;
  pageNumber: number;
  evidenceId?: string;
  originalValue: string;
  correctedValue: string | null;
  createdAt: string;
};

export type ProtoDoc = {
  id: string;
  title: string;
  filename: string;
  category: DocumentCategory | null;
  uploadedAt: string;
  lifecycle: DocumentLifecycle;
  /** Processing stage index: 0 received, 1 reading, 2 understanding, 3 checking, 4 preparing. */
  step: number;
  analysis: AnalysisResult | null;
  pending: AnalysisResult | null;
  pages: DocPage[];
  corrections: CorrectionRecord[];
  error?: string;
  ambiguous?: boolean;
  askCategory?: DocumentCategory[];
  previewUrl?: string;
  uploadedByUser?: boolean;
  /** Backed by the real /api (vault list, real upload). Skips the simulated pipeline. */
  real?: boolean;
};

export type Relationship = {
  id: string;
  sourceId: string;
  targetId: string;
  type: RelationshipType;
  confidence: number;
  decision: "SUGGESTED" | "APPROVED" | "REJECTED";
  reasons: string[];
};

export type Reminder = {
  id: string;
  docId: string;
  title: string;
  dueAt: string;
  remindAt: string;
  status: "SCHEDULED" | "DONE";
};

export type Share = {
  id: string;
  name: string;
  email: string;
  docIds: string[];
  status: "PENDING" | "ACTIVE";
};

export const CATEGORY_LABEL: Record<DocumentCategory, string> = {
  GOVERNMENT: "Government",
  FINANCIAL: "Financial",
  EMPLOYMENT: "Employment",
  LEGAL: "Legal",
  MEDICAL: "Medical",
  EDUCATION: "Education",
  UTILITIES: "Utilities",
  PERSONAL: "Personal",
  OTHER: "Other",
};

export const STATUS_LABEL: Record<InformationStatus, string> = {
  FOUND: "In the document",
  NOT_FOUND: "Not in the document",
  UNCLEAR: "Hard to read",
  CONFLICTING: "Conflicting",
  INFERRED: "Our interpretation",
};

export const LIFECYCLE_LABEL: Record<DocumentLifecycle, string> = {
  AWAITING_UPLOAD: "Waiting for upload",
  UPLOADED: "Received",
  OCR_PROCESSING: "Reading",
  OCR_READY: "Read",
  OCR_PARTIAL: "Some pages unreadable",
  OCR_FAILED: "Couldn't read",
  ANALYZING: "Understanding",
  NEEDS_CORRECTION: "Needs your correction",
  REVIEW_REQUIRED: "Needs your review",
  ANALYSIS_FAILED: "Report failed",
  COMPLETED: "Report ready",
};

export const LANGUAGE_LABEL: Record<ExplanationLanguage, string> = {
  EN: "English",
  FIL: "Filipino",
  TAGLISH: "Taglish",
};

export const PROCESSING_LIFECYCLES: ReadonlySet<DocumentLifecycle> = new Set([
  "UPLOADED",
  "OCR_PROCESSING",
  "OCR_READY",
  "OCR_PARTIAL",
  "ANALYZING",
]);

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export function formatDate(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${MONTHS[m - 1]} ${d}, ${y}`;
}

export function daysUntil(iso: string): number {
  const a = Date.UTC(...ymd(TODAY));
  const b = Date.UTC(...ymd(iso));
  return Math.round((b - a) / 86_400_000);
}

export function shiftDate(iso: string, days: number): string {
  const t = Date.UTC(...ymd(iso)) + days * 86_400_000;
  return new Date(t).toISOString().slice(0, 10);
}

function ymd(iso: string): [number, number, number] {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return [y, m - 1, d];
}

export function relativeDays(iso: string): string {
  const n = daysUntil(iso);
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}

let seq = 0;
/** Call only from event handlers, never during render. */
export function uid(prefix: string): string {
  seq += 1;
  return `${prefix}-${Date.now().toString(36)}-${seq}`;
}

export function finalLifecycle(a: AnalysisResult): DocumentLifecycle {
  const required = a.reviewRequirements.filter(
    (r) => r.reviewStatus === "REQUIRED",
  );
  if (required.some((r) => r.impactLevel === "CRITICAL"))
    return "NEEDS_CORRECTION";
  if (required.length > 0) return "REVIEW_REQUIRED";
  return "COMPLETED";
}

export const CORRECTED_BASIS = "Corrected by you. The original reading is kept.";

/**
 * Mock reanalysis: resolves the review item, adds the user's value as a
 * separate USER_CORRECTION evidence entry, and rechecks only the findings
 * that relied on the corrected evidence.
 */
export function applyCorrection(
  analysis: AnalysisResult,
  reviewId: string,
  value: string | null,
): AnalysisResult {
  const next = structuredClone(analysis);
  const review = next.reviewRequirements.find((r) => r.id === reviewId);
  if (!review) return next;
  review.reviewStatus = "RESOLVED";
  const sourceId = review.evidenceId;
  const issuer = next.document.issuer ?? "the issuer";

  if (value === null) {
    next.nextSteps.unshift({
      id: `${reviewId}-ask`,
      title: `Ask ${issuer} for the exact ${review.field.toLowerCase()}`,
      explanation:
        "You couldn't read it either, so don't rely on the number shown. Get it from the issuer before acting.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "You marked this value as unreadable.",
      evidenceIds: sourceId ? [sourceId] : [],
    });
    next.limitations.push(
      `You marked the ${review.field.toLowerCase()} as unreadable. ABOT will not guess it.`,
    );
    return next;
  }

  const original = next.evidence.find((e) => e.id === sourceId);
  const correctedId = `${sourceId ?? reviewId}-c`;
  next.evidence.push({
    id: correctedId,
    documentId: original?.documentId ?? next.document.documentId,
    pageNumber: review.pageNumber,
    excerpt: `${review.field}: ${value}`,
    sourceType: "USER_CORRECTION",
  });

  const lists = [
    next.keyInformation,
    next.obligations,
    next.consequences,
    next.importantDates,
  ] as const;
  for (const list of lists) {
    for (const f of list) {
      if (sourceId && f.evidenceIds.includes(sourceId)) {
        f.evidenceIds = [correctedId, ...f.evidenceIds];
        if (f.id === review.findingId) {
          f.informationStatus = "FOUND";
          f.confidence = 0.95;
          f.explanation = `You confirmed the ${review.field.toLowerCase()} is ${value}.`;
          f.basis = CORRECTED_BASIS;
        }
      }
    }
  }
  const relied = (ids: string[]) => !!sourceId && ids.includes(sourceId);
  next.watchouts = next.watchouts.filter(
    (w) => !(w.informationStatus === "UNCLEAR" && relied(w.evidenceIds)),
  );
  next.nextSteps = next.nextSteps.filter(
    (s) => !s.basis.startsWith("Review requirement"),
  );
  next.limitations = next.limitations.filter(
    (l) => !/confidence/i.test(l),
  );
  next.analysisMetadata.analysisVersion += 1;
  return next;
}

// ---------------------------------------------------------------------------
// Additional sample analyses (contract-validated)
// ---------------------------------------------------------------------------

const base = (modules: string[]): AnalysisResult["analysisMetadata"] => ({
  modelInstanceId: null,
  generatedAt: "2026-11-12T08:00:00.000Z",
  analysisVersion: 1,
  language: "EN",
  categoryModules: modules,
  partial: false,
  unavailablePages: [],
});

export const contractAnalysis: AnalysisResult = analysisResultSchema.parse({
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentId: "doc-contract",
    documentType: "EMPLOYMENT",
    documentSubtype: "Probationary employment contract",
    issuer: "Sample BPO Services Inc.",
    classificationConfidence: 0.95,
  },
  overview:
    "A 6-month probationary job contract for a Customer Support Associate role.",
  explanation:
    "This contract offers you a job starting December 1, 2026 at PHP 22,000 a month. You are on probation first. If you resign within 12 months, you must repay PHP 50,000 in training costs. The performance standards you will be judged on are in Annex B, which was not included.",
  keyInformation: [
    {
      id: "em-salary",
      title: "Monthly salary",
      explanation: "Your basic pay is PHP 22,000.00 a month.",
      informationStatus: "FOUND",
      confidence: 0.94,
      basis: "Stated in the compensation clause.",
      evidenceIds: ["em-e1"],
    },
    {
      id: "em-role",
      title: "Position",
      explanation: "Customer Support Associate, probationary.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis: "Stated at the top of the contract.",
      evidenceIds: ["em-e9"],
    },
  ],
  obligations: [
    {
      id: "em-ob-standards",
      title: "Meet the performance standards to become regular",
      explanation:
        "You become a regular employee only if you meet the standards in Annex B.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Regularization clause.",
      evidenceIds: ["em-e3"],
    },
    {
      id: "em-ob-notice",
      title: "Give 30 days' notice before resigning",
      explanation: "You must tell the company in writing at least 30 days ahead.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: "Resignation clause.",
      evidenceIds: ["em-e4"],
    },
  ],
  watchouts: [
    {
      id: "em-w-bond",
      title: "PHP 50,000 training bond",
      explanation:
        "If you resign within 12 months, the contract asks you to repay PHP 50,000.00 in training costs.",
      severity: "HIGH",
      informationStatus: "FOUND",
      confidence: 0.91,
      basis: "Training reimbursement clause on page 2.",
      evidenceIds: ["em-e5"],
    },
    {
      id: "em-w-annex",
      title: "Annex B is missing",
      explanation:
        "The contract refers to performance standards in Annex B, but Annex B is not in what you uploaded.",
      severity: "MEDIUM",
      informationStatus: "NOT_FOUND",
      confidence: 0.86,
      basis: "Referenced on page 2; only Annex A is listed as attached.",
      evidenceIds: ["em-e3", "em-e10"],
    },
    {
      id: "em-w-schedule",
      title: "Your schedule can change",
      explanation: "The company can change your work schedule based on business needs.",
      severity: "LOW",
      informationStatus: "FOUND",
      confidence: 0.88,
      basis: "Work schedule clause.",
      evidenceIds: ["em-e6"],
    },
  ],
  consequences: [
    {
      id: "em-c-bond",
      kind: "EXPLICIT",
      title: "Repay training costs if you leave early",
      explanation: "Resigning within 12 months means paying back PHP 50,000.00.",
      informationStatus: "FOUND",
      confidence: 0.91,
      basis: "Training reimbursement clause.",
      evidenceIds: ["em-e5"],
    },
    {
      id: "em-c-finalpay",
      kind: "INFERRED",
      title: "The bond might be taken from your final pay",
      explanation:
        "The contract doesn't say how the bond is collected. Ask HR whether it would be deducted from your last salary.",
      informationStatus: "INFERRED",
      confidence: 0.45,
      basis: "Common practice; not stated in this contract.",
      evidenceIds: [],
    },
  ],
  nextSteps: [
    {
      id: "em-n-annex",
      title: "Ask HR for Annex B before you sign",
      explanation: "You should know the standards you'll be judged on.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Annex B is referenced but missing.",
      evidenceIds: ["em-e3"],
    },
    {
      id: "em-n-bond",
      title: "Ask if the bond goes down over time",
      explanation:
        "Some bonds are reduced month by month. This contract doesn't say.",
      informationStatus: "NOT_FOUND",
      confidence: 0.7,
      basis: "No reduction schedule in the clause.",
      evidenceIds: ["em-e5"],
    },
    {
      id: "em-n-copy",
      title: "Keep a signed copy for yourself",
      explanation: "Ask for a copy signed by both you and the company.",
      informationStatus: "INFERRED",
      confidence: 0.8,
      basis: "General good practice.",
      evidenceIds: [],
    },
  ],
  importantDates: [
    {
      id: "em-d-return",
      title: "Return the signed contract",
      explanation: "The company asks for your signed copy by this date.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Stated at the end of page 2.",
      evidenceIds: ["em-e8"],
      date: "2026-11-20",
      dateText: "November 20, 2026",
    },
    {
      id: "em-d-start",
      title: "First day of work",
      explanation: "Your employment starts on this date.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis: "Start date clause.",
      evidenceIds: ["em-e7"],
      date: "2026-12-01",
      dateText: "December 1, 2026",
    },
  ],
  specializedSections: [
    {
      id: "compensation",
      title: "Pay and benefits",
      items: [
        {
          id: "em-s-nd",
          title: "Night shift differential",
          explanation:
            "You get an extra 10% of your hourly rate for work between 10 PM and 6 AM.",
          informationStatus: "FOUND",
          confidence: 0.89,
          basis: "Compensation clause.",
          evidenceIds: ["em-e2"],
        },
        {
          id: "em-s-hmo",
          title: "Health coverage",
          explanation: "The contract doesn't mention HMO or health benefits.",
          informationStatus: "NOT_FOUND",
          confidence: 0.75,
          basis: "No benefits clause found.",
          evidenceIds: [],
        },
      ],
    },
    {
      id: "termination",
      title: "Leaving the job",
      items: [
        {
          id: "em-s-notice",
          title: "Resignation notice",
          explanation: "30 days' written notice.",
          informationStatus: "FOUND",
          confidence: 0.93,
          basis: "Resignation clause.",
          evidenceIds: ["em-e4"],
        },
      ],
    },
  ],
  evidence: [
    ev("em-e1", "doc-contract", 1, "Basic monthly salary: PHP 22,000.00"),
    ev("em-e2", "doc-contract", 1, "Night shift differential: 10% of hourly rate for work between 10PM and 6AM"),
    ev("em-e3", "doc-contract", 2, "Regularization is subject to meeting performance standards defined in Annex B."),
    ev("em-e4", "doc-contract", 2, "Employee must give at least thirty (30) days written notice before resigning."),
    ev("em-e5", "doc-contract", 2, "Employee who resigns within twelve (12) months shall reimburse training costs of PHP 50,000.00."),
    ev("em-e6", "doc-contract", 1, "Work schedule may be changed by the Company based on business needs."),
    ev("em-e7", "doc-contract", 1, "Start of employment: December 1, 2026"),
    ev("em-e8", "doc-contract", 2, "Please return a signed copy on or before November 20, 2026."),
    ev("em-e9", "doc-contract", 1, "Position: Customer Support Associate"),
    ev("em-e10", "doc-contract", 2, "Attachments: Annex A (Job Description)"),
  ],
  limitations: [
    "Annex B (performance standards) was not included in the upload.",
    "ABOT can't tell you whether these terms are legal. If unsure, ask DOLE or a lawyer.",
  ],
  reviewRequirements: [],
  analysisMetadata: base(["compensation", "termination"]),
});

export const receiptAnalysis: AnalysisResult = analysisResultSchema.parse({
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentId: "doc-receipt",
    documentType: "FINANCIAL",
    documentSubtype: "Official receipt",
    issuer: "Sample Electric Cooperative",
    classificationConfidence: 0.91,
  },
  overview: "An official receipt for a PHP 2,450.00 payment to the electric cooperative.",
  explanation:
    "This receipt shows you paid PHP 2,450.00 over the counter on November 12, 2026 for account 0412-5567-01.",
  keyInformation: [
    {
      id: "rc-amount",
      title: "Amount paid",
      explanation: "PHP 2,450.00 was paid.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: "Printed on the receipt.",
      evidenceIds: ["rc-e1"],
    },
    {
      id: "rc-date",
      title: "Date paid",
      explanation: "November 12, 2026.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis: "Printed on the receipt.",
      evidenceIds: ["rc-e2"],
    },
    {
      id: "rc-account",
      title: "Account number",
      explanation: "0412-5567-01.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Printed on the receipt.",
      evidenceIds: ["rc-e3"],
    },
  ],
  obligations: [],
  watchouts: [
    {
      id: "rc-w-month",
      title: "Billing month isn't shown",
      explanation: "The receipt doesn't say which bill this payment was for.",
      severity: "LOW",
      informationStatus: "NOT_FOUND",
      confidence: 0.8,
      basis: "No billing period on the receipt.",
      evidenceIds: [],
    },
  ],
  consequences: [],
  nextSteps: [
    {
      id: "rc-n-keep",
      title: "Keep this receipt with the bill",
      explanation: "It's your proof of payment if there's a dispute.",
      informationStatus: "INFERRED",
      confidence: 0.8,
      basis: "General good practice.",
      evidenceIds: [],
    },
  ],
  importantDates: [],
  specializedSections: [],
  evidence: [
    ev("rc-e1", "doc-receipt", 1, "Amount paid: PHP 2,450.00"),
    ev("rc-e2", "doc-receipt", 1, "Date paid: November 12, 2026"),
    ev("rc-e3", "doc-receipt", 1, "Account No. 0412-5567-01"),
  ],
  limitations: [],
  reviewRequirements: [],
  analysisMetadata: base(["interest-and-fees"]),
});

export const noticeAnalysis: AnalysisResult = analysisResultSchema.parse({
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentId: "doc-notice",
    documentType: "GOVERNMENT",
    documentSubtype: "Notice of incomplete requirements",
    issuer: "Sample City Social Welfare Office",
    classificationConfidence: 0.62,
  },
  overview:
    "A notice that your Senior Citizen ID application is missing two requirements.",
  explanation:
    "The city welfare office can't process your Senior Citizen ID yet. Submit a PSA birth certificate and a recent barangay certificate by November 27, 2026, or the application will be closed.",
  keyInformation: [
    {
      id: "gv-ref",
      title: "Application number",
      explanation: "SC-2026-08812, for a Senior Citizen ID.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Printed under the title.",
      evidenceIds: ["gv-e1"],
    },
  ],
  obligations: [
    {
      id: "gv-ob-submit",
      title: "Submit the two missing documents",
      explanation: "Bring both documents to the office before the deadline.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Listed in the notice.",
      evidenceIds: ["gv-e2", "gv-e3", "gv-e4"],
    },
  ],
  watchouts: [
    {
      id: "gv-w-closed",
      title: "Application closes after the deadline",
      explanation: "If you miss November 27, the office will close your application.",
      severity: "HIGH",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Stated directly in the notice.",
      evidenceIds: ["gv-e5"],
    },
    {
      id: "gv-w-hours",
      title: "Two different closing times",
      explanation:
        "The notice says the office is open until 5:00 PM, but also that Window 3 takes submissions only until 3:00 PM. Go before 3:00 PM to be safe.",
      severity: "MEDIUM",
      informationStatus: "CONFLICTING",
      confidence: 0.85,
      basis: "Both times are printed on page 1.",
      evidenceIds: ["gv-e6", "gv-e7"],
    },
  ],
  consequences: [
    {
      id: "gv-c-closed",
      kind: "EXPLICIT",
      title: "Your application will be closed",
      explanation: "The notice says incomplete applications are closed after the period.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Stated in the notice.",
      evidenceIds: ["gv-e5"],
    },
    {
      id: "gv-c-reapply",
      kind: "INFERRED",
      title: "You may need to apply again from the start",
      explanation: "Not stated. Ask the office whether a closed application can be reopened.",
      informationStatus: "INFERRED",
      confidence: 0.5,
      basis: "Not in this notice.",
      evidenceIds: [],
    },
  ],
  nextSteps: [
    {
      id: "gv-n-psa",
      title: "Request a PSA birth certificate",
      explanation: "Order online or at a PSA outlet. Bring the original and a photocopy.",
      informationStatus: "FOUND",
      confidence: 0.85,
      basis: "Requirement 1.",
      evidenceIds: ["gv-e2"],
    },
    {
      id: "gv-n-brgy",
      title: "Get a barangay certificate of residency",
      explanation: "It must be issued within the last 3 months.",
      informationStatus: "FOUND",
      confidence: 0.85,
      basis: "Requirement 2.",
      evidenceIds: ["gv-e3"],
    },
  ],
  importantDates: [
    {
      id: "gv-d-deadline",
      title: "Submit requirements",
      explanation: "Last day to complete your application.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Stated in the notice.",
      evidenceIds: ["gv-e4"],
      date: "2026-11-27",
      dateText: "November 27, 2026",
    },
  ],
  specializedSections: [
    {
      id: "requirements",
      title: "Requirements checklist",
      items: [
        {
          id: "gv-s-1",
          title: "PSA Birth Certificate",
          explanation: "Original and photocopy.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Requirement 1.",
          evidenceIds: ["gv-e2"],
        },
        {
          id: "gv-s-2",
          title: "Barangay Certificate of Residency",
          explanation: "Issued within the last 3 months.",
          informationStatus: "FOUND",
          confidence: 0.9,
          basis: "Requirement 2.",
          evidenceIds: ["gv-e3"],
        },
      ],
    },
  ],
  evidence: [
    ev("gv-e1", "doc-notice", 1, "Application No. SC-2026-08812, Senior Citizen ID"),
    ev("gv-e2", "doc-notice", 1, "1. PSA Birth Certificate (original and photocopy)"),
    ev("gv-e3", "doc-notice", 1, "2. Barangay Certificate of Residency issued within the last 3 months"),
    ev("gv-e4", "doc-notice", 1, "Submit within fifteen (15) days from receipt of this notice, or by November 27, 2026."),
    ev("gv-e5", "doc-notice", 1, "Incomplete applications after this period will be closed."),
    ev("gv-e6", "doc-notice", 1, "Office hours: Monday to Friday, 8:00 AM to 5:00 PM"),
    ev("gv-e7", "doc-notice", 1, "Window 3 accepts submissions from 8:00 AM to 3:00 PM only."),
  ],
  limitations: ["The notice doesn't say whether a closed application can be reopened."],
  reviewRequirements: [],
  analysisMetadata: base(["requirements"]),
});

export const medicalAnalysis: AnalysisResult = analysisResultSchema.parse({
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentId: "doc-lab",
    documentType: "MEDICAL",
    documentSubtype: "Laboratory request",
    issuer: "Sample Health Clinic",
    classificationConfidence: 0.9,
  },
  overview: "A lab test request for blood work on November 18, 2026.",
  explanation:
    "The clinic wants three blood tests. Don't eat for 10 to 12 hours before. Water is fine. Bring this paper and a valid ID.",
  keyInformation: [
    {
      id: "md-tests",
      title: "Tests requested",
      explanation: "CBC, FBS, and Lipid Profile.",
      informationStatus: "FOUND",
      confidence: 0.88,
      basis: "Listed on the request.",
      evidenceIds: ["md-e1"],
    },
  ],
  obligations: [
    {
      id: "md-ob-fast",
      title: "Fast for 10 to 12 hours",
      explanation: "No food before the blood draw. Water is allowed.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Printed instructions.",
      evidenceIds: ["md-e2"],
    },
    {
      id: "md-ob-bring",
      title: "Bring the request and a valid ID",
      explanation: "The clinic needs both on the day.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Printed instructions.",
      evidenceIds: ["md-e4"],
    },
  ],
  watchouts: [
    {
      id: "md-w-meds",
      title: "Medicines during fasting aren't mentioned",
      explanation:
        "The request doesn't say whether to take maintenance medicines while fasting. Ask your doctor.",
      severity: "MEDIUM",
      informationStatus: "NOT_FOUND",
      confidence: 0.8,
      basis: "No medicine instructions on the request.",
      evidenceIds: [],
    },
  ],
  consequences: [],
  nextSteps: [
    {
      id: "md-n-ask",
      title: "Ask your doctor about maintenance medicines",
      explanation: "Before you start fasting.",
      informationStatus: "INFERRED",
      confidence: 0.8,
      basis: "Not covered by the request.",
      evidenceIds: [],
    },
  ],
  importantDates: [
    {
      id: "md-d-appt",
      title: "Blood draw",
      explanation: "Be at the clinic by 7:00 AM.",
      informationStatus: "FOUND",
      confidence: 0.9,
      basis: "Printed schedule.",
      evidenceIds: ["md-e3"],
      date: "2026-11-18",
      dateText: "November 18, 2026, 7:00 AM",
    },
  ],
  specializedSections: [
    {
      id: "medical-terms",
      title: "Medical terms explained",
      items: [
        {
          id: "md-s-cbc",
          title: "CBC",
          explanation: "Complete blood count. Checks your red and white blood cells.",
          informationStatus: "INFERRED",
          confidence: 0.9,
          basis: "Standard meaning of the abbreviation.",
          evidenceIds: ["md-e1"],
        },
        {
          id: "md-s-fbs",
          title: "FBS",
          explanation: "Fasting blood sugar. This is why you need to fast.",
          informationStatus: "INFERRED",
          confidence: 0.9,
          basis: "Standard meaning of the abbreviation.",
          evidenceIds: ["md-e1"],
        },
      ],
    },
  ],
  evidence: [
    ev("md-e1", "doc-lab", 1, "Tests: CBC, FBS, Lipid Profile"),
    ev("md-e2", "doc-lab", 1, "Fasting: 10-12 hours before extraction. Water is allowed."),
    ev("md-e3", "doc-lab", 1, "Schedule: November 18, 2026, 7:00 AM"),
    ev("md-e4", "doc-lab", 1, "Bring this request and a valid ID."),
  ],
  limitations: [
    "ABOT explains instructions. It doesn't give medical advice.",
  ],
  reviewRequirements: [],
  analysisMetadata: base(["medical-terms"]),
});

function ev(id: string, documentId: string, pageNumber: number, excerpt: string) {
  return { id, documentId, pageNumber, excerpt, sourceType: "OCR_TEXT" as const };
}

// ---------------------------------------------------------------------------
// Page text (what the OCR "read")
// ---------------------------------------------------------------------------

const PAGES: Record<string, DocPage[]> = {
  "doc-electric": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE ELECTRIC COOPERATIVE", tone: "title" },
        { text: "Statement of Account, November 2026", tone: "muted" },
        { text: "Account No. 0412-5567-01" },
        { text: "Account name: Maria L. Santos" },
        { text: "Billing period: Oct 10 to Nov 9, 2026" },
        { text: "Consumption: 250 kWh", evidenceId: "e-4" },
        { text: "Generation charge ........ PHP 1,310.40", tone: "muted" },
        { text: "Distribution charge ...... PHP 702.15", tone: "muted" },
        { text: "Taxes and other charges .. PHP 437.45", tone: "muted" },
        { text: "Amount Due: PHP 2,450.00", evidenceId: "e-1", smudged: true },
        { text: "Due Date: December 15, 2026", evidenceId: "e-2" },
      ],
    },
    {
      number: 2,
      lines: [
        { text: "REMINDERS", tone: "title" },
        { text: "A surcharge applies to payments after the due date.", evidenceId: "e-3" },
        { text: "Pay at any accredited payment center.", tone: "muted" },
      ],
    },
  ],
  "doc-water": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE WATER DISTRICT", tone: "title" },
        { text: "Water Bill, November 2026", tone: "muted" },
        { text: "Account: 22-1187" },
        { text: "Consumption: 18 cu.m." },
        { text: "Total Am0unt Due: PHP 741.85", evidenceId: "nc-e-1", smudged: true },
        { text: "Due Date: November 30, 2026", evidenceId: "nc-e-2" },
      ],
    },
  ],
  "doc-contract": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE BPO SERVICES INC.", tone: "title" },
        { text: "PROBATIONARY EMPLOYMENT CONTRACT", tone: "muted" },
        { text: "Employee: Maria L. Santos" },
        { text: "Position: Customer Support Associate", evidenceId: "em-e9" },
        { text: "Start of employment: December 1, 2026", evidenceId: "em-e7" },
        { text: "Basic monthly salary: PHP 22,000.00", evidenceId: "em-e1" },
        { text: "Night shift differential: 10% of hourly rate for work between 10PM and 6AM", evidenceId: "em-e2" },
        { text: "Work schedule may be changed by the Company based on business needs.", evidenceId: "em-e6" },
      ],
    },
    {
      number: 2,
      lines: [
        { text: "Regularization is subject to meeting performance standards defined in Annex B.", evidenceId: "em-e3" },
        { text: "Employee must give at least thirty (30) days written notice before resigning.", evidenceId: "em-e4" },
        { text: "Employee who resigns within twelve (12) months shall reimburse training costs of PHP 50,000.00.", evidenceId: "em-e5" },
        { text: "Please return a signed copy on or before November 20, 2026.", evidenceId: "em-e8" },
        { text: "Attachments: Annex A (Job Description)", evidenceId: "em-e10" },
      ],
    },
  ],
  "doc-receipt": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE ELECTRIC COOPERATIVE", tone: "title" },
        { text: "OFFICIAL RECEIPT No. 0098812", tone: "muted" },
        { text: "Account No. 0412-5567-01", evidenceId: "rc-e3" },
        { text: "Amount paid: PHP 2,450.00", evidenceId: "rc-e1" },
        { text: "Date paid: November 12, 2026", evidenceId: "rc-e2" },
        { text: "Payment channel: Over the counter", tone: "muted" },
      ],
    },
  ],
  "doc-loan": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE LENDING CORPORATION", tone: "title" },
        { text: "Quarterly Loan Statement, Q3 2026", tone: "muted" },
        { text: "Borrower: Maria L. Santos" },
        { text: "Outstanding Balance: PHP 18,200.00", evidenceId: "p-e-1" },
        { text: "Continued on page 2", tone: "muted" },
      ],
    },
    { number: 2, lines: [], unavailable: true },
  ],
  "doc-lab": [
    {
      number: 1,
      lines: [
        { text: "SAMPLE HEALTH CLINIC", tone: "title" },
        { text: "LABORATORY REQUEST", tone: "muted" },
        { text: "Patient: Lourdes R. Santos" },
        { text: "Tests: CBC, FBS, Lipid Profile", evidenceId: "md-e1" },
        { text: "Fasting: 10-12 hours before extraction. Water is allowed.", evidenceId: "md-e2" },
        { text: "Schedule: November 18, 2026, 7:00 AM", evidenceId: "md-e3" },
        { text: "Bring this request and a valid ID.", evidenceId: "md-e4" },
      ],
    },
  ],
  notice: [
    {
      number: 1,
      lines: [
        { text: "CITY SOCIAL WELFARE AND DEVELOPMENT OFFICE", tone: "title" },
        { text: "NOTICE OF INCOMPLETE REQUIREMENTS", tone: "muted" },
        { text: "Application No. SC-2026-08812, Senior Citizen ID", evidenceId: "gv-e1" },
        { text: "Your application cannot be processed until the following are submitted:" },
        { text: "1. PSA Birth Certificate (original and photocopy)", evidenceId: "gv-e2" },
        { text: "2. Barangay Certificate of Residency issued within the last 3 months", evidenceId: "gv-e3" },
        { text: "Submit within fifteen (15) days from receipt of this notice, or by November 27, 2026.", evidenceId: "gv-e4" },
        { text: "Incomplete applications after this period will be closed.", evidenceId: "gv-e5" },
        { text: "Office hours: Monday to Friday, 8:00 AM to 5:00 PM", evidenceId: "gv-e6" },
        { text: "Window 3 accepts submissions from 8:00 AM to 3:00 PM only.", evidenceId: "gv-e7" },
      ],
    },
  ],
};

function doc(partial: Partial<ProtoDoc> & Pick<ProtoDoc, "id" | "title" | "filename" | "uploadedAt" | "lifecycle">): ProtoDoc {
  return {
    category: partial.analysis?.document.documentType ?? null,
    step: 4,
    analysis: null,
    pending: null,
    pages: PAGES[partial.id] ?? [],
    corrections: [],
    ...partial,
  };
}

export const initialDocs: ProtoDoc[] = [
  doc({
    id: "doc-lab",
    title: "Lab request for Nanay",
    filename: "IMG_2041.jpg",
    uploadedAt: "2026-11-13",
    lifecycle: "OCR_FAILED",
    step: 1,
    category: null,
    error: "We couldn't finish reading this photo. You can try reading it again.",
    pending: medicalAnalysis,
  }),
  doc({
    id: "doc-electric",
    title: "Electric bill, November",
    filename: "meralco-nov.pdf",
    uploadedAt: "2026-11-11",
    lifecycle: "REVIEW_REQUIRED",
    analysis: mockUtilityBillAnalysis,
  }),
  doc({
    id: "doc-water",
    title: "Water bill, November",
    filename: "water-bill.jpg",
    uploadedAt: "2026-11-10",
    lifecycle: "NEEDS_CORRECTION",
    analysis: mockNeedsCorrectionAnalysis,
  }),
  doc({
    id: "doc-contract",
    title: "Job offer contract",
    filename: "contract-signed-draft.pdf",
    uploadedAt: "2026-11-12",
    lifecycle: "COMPLETED",
    analysis: contractAnalysis,
  }),
  doc({
    id: "doc-receipt",
    title: "Electric payment receipt",
    filename: "receipt-0098812.jpg",
    uploadedAt: "2026-11-12",
    lifecycle: "COMPLETED",
    analysis: receiptAnalysis,
  }),
  doc({
    id: "doc-loan",
    title: "Loan statement, Q3",
    filename: "loan-q3.pdf",
    uploadedAt: "2026-11-05",
    lifecycle: "COMPLETED",
    analysis: mockPartialAnalysis,
  }),
];

export function makeUploadedDoc(input: {
  id: string;
  filename: string;
  previewUrl?: string;
  ambiguous: boolean;
}): ProtoDoc {
  const title = input.filename.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
  return {
    id: input.id,
    title: title.length > 0 ? title : "New document",
    filename: input.filename,
    category: null,
    uploadedAt: TODAY,
    lifecycle: "UPLOADED",
    step: 0,
    analysis: null,
    pending: structuredClone(noticeAnalysis),
    pages: PAGES.notice,
    corrections: [],
    ambiguous: input.ambiguous,
    previewUrl: input.previewUrl,
    uploadedByUser: true,
  };
}

export const initialRelationships: Relationship[] = [
  {
    id: "rel-1",
    sourceId: "doc-receipt",
    targetId: "doc-electric",
    type: "POSSIBLE_MATCH",
    confidence: 0.78,
    decision: "SUGGESTED",
    reasons: [
      "Same account number, 0412-5567-01, on both",
      "Same amount, PHP 2,450.00",
      "Receipt date (Nov 12) is before the bill's due date (Dec 15)",
    ],
  },
];

export const initialReminders: Reminder[] = [
  {
    id: "rem-1",
    docId: "doc-contract",
    title: "Return the signed contract",
    dueAt: "2026-11-20",
    remindAt: "2026-11-17",
    status: "SCHEDULED",
  },
  {
    id: "rem-2",
    docId: "doc-water",
    title: "Pay the water bill",
    dueAt: "2026-11-30",
    remindAt: "2026-11-27",
    status: "SCHEDULED",
  },
  {
    id: "rem-3",
    docId: "doc-electric",
    title: "Pay the electric bill",
    dueAt: "2026-12-15",
    remindAt: "2026-12-12",
    status: "SCHEDULED",
  },
];

// ---------------------------------------------------------------------------
// Explanation language. Explanations switch without re-reading the document.
// ---------------------------------------------------------------------------

type Copy = {
  overview?: string;
  explanation?: string;
  findings?: Record<string, { title: string; explanation: string }>;
};

export const TRANSLATIONS: Record<string, Partial<Record<ExplanationLanguage, Copy>>> = {
  "doc-electric": {
    EN: {
      overview:
        "Your November electric bill from Sample Electric Cooperative. It says how much you owe and when to pay.",
      explanation:
        "This is a monthly statement for your electricity use. You used 250 kWh this period. The bill asks you to pay PHP 2,450.00 by December 15, 2026. If you pay late, the cooperative adds a surcharge.",
    },
    FIL: {
      overview:
        "Ito ang singil mo sa kuryente para sa Nobyembre mula sa Sample Electric Cooperative. Nakasaad dito kung magkano ang babayaran at kailan.",
      explanation:
        "Buwanang singil ito para sa nagamit mong kuryente. 250 kWh ang nagamit mo ngayong billing period. PHP 2,450.00 ang kailangang bayaran hanggang Disyembre 15, 2026. Kapag na-late ang bayad, may dagdag na surcharge.",
      findings: {
        "f-amount": { title: "Halagang babayaran", explanation: "Nakasaad sa bill na PHP 2,450.00 ang babayaran." },
        "f-pay": { title: "Magbayad bago ang due date", explanation: "Dapat mabayaran ito hanggang sa due date." },
        "w-late": { title: "Multa sa late na bayad", explanation: "Maaaring may surcharge kapag na-late ang bayad." },
        "c-1": { title: "Surcharge kapag late", explanation: "Sinasabi ng bill na may surcharge pagkalipas ng due date." },
        "c-2": { title: "Posibleng maputulan kung hindi mabayaran", explanation: "Hindi ito nakasulat dito. Tanungin ang kooperatiba tungkol sa patakaran sa pagputol ng kuryente." },
        "n-1": { title: "Tiyakin ang halaga bago magbayad", explanation: "Malabo ang pagkabasa sa halaga. Itugma ito sa orihinal na bill." },
        "d-due": { title: "Huling araw ng bayad", explanation: "Ito ang huling araw para magbayad." },
        "b-1": { title: "Nagamit na kuryente", explanation: "250 kWh ang nagamit ngayong billing period." },
      },
    },
    TAGLISH: {
      overview:
        "Ito yung electric bill mo for November galing sa Sample Electric Cooperative. Nandito kung magkano at kailan ka dapat magbayad.",
      explanation:
        "Monthly bill ito ng kuryente mo. 250 kWh ang nagamit mo this period. Kailangan mong bayaran ang PHP 2,450.00 by December 15, 2026. Pag late ka nagbayad, may surcharge.",
      findings: {
        "f-amount": { title: "Amount na babayaran", explanation: "Sabi ng bill, PHP 2,450.00 ang due." },
        "f-pay": { title: "Magbayad before due date", explanation: "Dapat bayad na ito by the due date." },
        "w-late": { title: "Late payment charge", explanation: "Puwedeng may surcharge pag late ang bayad." },
        "c-1": { title: "Surcharge pag late", explanation: "Sabi ng bill, may surcharge after ng due date." },
        "c-2": { title: "Possible disconnection pag hindi nabayaran", explanation: "Wala ito sa document. Itanong sa cooperative ang rules nila sa disconnection." },
        "n-1": { title: "I-confirm ang amount bago magbayad", explanation: "Medyo malabo ang basa sa amount. I-check mo sa original na bill." },
        "d-due": { title: "Payment due date", explanation: "Ito ang last day para magbayad." },
        "b-1": { title: "Consumption", explanation: "250 kWh ang nagamit this period." },
      },
    },
  },
  "doc-water": {
    EN: {
      explanation:
        "The amount on this water bill was hard to read. Check it against your paper bill before you pay. The due date is November 30, 2026.",
    },
    FIL: {
      overview: "Singil sa tubig na malabo ang halaga, kaya kailangan itong itama bago gamitin.",
      explanation: "Hindi malinaw na nabasa ang halagang babayaran. Itugma ito sa orihinal na bill bago ka magbayad. Ang due date ay Nobyembre 30, 2026.",
    },
    TAGLISH: {
      overview: "Water bill ito pero malabo ang basa sa amount, kaya i-correct muna bago gamitin.",
      explanation: "Hindi clear ang pagkabasa sa amount. I-check mo muna sa original na bill bago magbayad. Due date ay November 30, 2026.",
    },
  },
  "doc-contract": {
    FIL: {
      overview: "Kontrata para sa 6 na buwang probationary na trabaho bilang Customer Support Associate.",
      explanation: "Inaalok ka ng trabaho simula Disyembre 1, 2026 sa PHP 22,000 kada buwan. Probationary ka muna. Kapag nag-resign ka sa loob ng 12 buwan, kailangan mong bayaran ang PHP 50,000 na training cost. Ang mga pamantayan sa performance ay nasa Annex B, na hindi kasama sa in-upload mo.",
    },
    TAGLISH: {
      overview: "Probationary job contract ito, 6 months, para sa Customer Support Associate.",
      explanation: "Start ka sa December 1, 2026 with PHP 22,000 monthly. Probationary ka muna. Pag nag-resign ka within 12 months, babayaran mo ang PHP 50,000 training cost. Yung performance standards ay nasa Annex B, pero wala ito sa na-upload mo.",
    },
  },
  "doc-receipt": {
    FIL: {
      overview: "Opisyal na resibo ng bayad na PHP 2,450.00 sa kooperatiba ng kuryente.",
      explanation: "Ipinapakita ng resibo na nagbayad ka ng PHP 2,450.00 noong Nobyembre 12, 2026 para sa account 0412-5567-01.",
    },
    TAGLISH: {
      overview: "Official receipt ito ng PHP 2,450.00 na bayad sa electric cooperative.",
      explanation: "Nagbayad ka ng PHP 2,450.00 over the counter noong November 12, 2026 para sa account 0412-5567-01.",
    },
  },
  "doc-loan": {
    EN: {
      explanation:
        "Your outstanding balance is PHP 18,200.00. Page 2 couldn't be read, so the interest rate and fee details are missing from this report.",
    },
    FIL: {
      overview: "Quarterly na statement ng utang. Hindi nabasa ang pangalawang pahina.",
      explanation: "PHP 18,200.00 ang natitirang utang. Kulang ang pahina 2, kaya wala sa report na ito ang detalye ng interest.",
    },
    TAGLISH: {
      overview: "Quarterly loan statement ito, pero hindi nabasa ang page 2.",
      explanation: "PHP 18,200.00 pa ang balance mo. Kulang ang page 2, kaya wala dito ang interest details.",
    },
  },
  "doc-lab": {
    FIL: {
      overview: "Request para sa blood test sa Nobyembre 18, 2026.",
      explanation: "Tatlong blood test ang hinihingi ng klinika. Huwag kumain 10 hanggang 12 oras bago nito. Puwede ang tubig. Dalhin ang papel na ito at isang valid ID.",
    },
    TAGLISH: {
      overview: "Lab request ito para sa blood test sa November 18, 2026.",
      explanation: "Tatlong blood test ang kailangan. Bawal kumain 10 to 12 hours before. Okay ang tubig. Dalhin itong request at valid ID.",
    },
  },
  notice: {
    FIL: {
      overview: "Abiso na kulang ng dalawang requirement ang aplikasyon mo para sa Senior Citizen ID.",
      explanation: "Hindi pa maproseso ang Senior Citizen ID mo. Magsumite ng PSA birth certificate at bagong barangay certificate hanggang Nobyembre 27, 2026, o isasara ang aplikasyon.",
    },
    TAGLISH: {
      overview: "Notice ito na may dalawang kulang na requirements ang Senior Citizen ID application mo.",
      explanation: "Hindi pa ma-process ang Senior Citizen ID mo. Mag-submit ng PSA birth certificate at recent barangay certificate by November 27, 2026, kundi isasara ang application.",
    },
  },
};

export function translationKey(d: ProtoDoc): string {
  return d.uploadedByUser ? "notice" : d.id;
}
