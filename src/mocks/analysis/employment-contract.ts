import { ANALYSIS_SCHEMA_VERSION, type AnalysisResult } from "@/contracts";

import { MOCK_DOCUMENT_IDS } from "../ids";

const documentId = MOCK_DOCUMENT_IDS.employmentContract;

/**
 * Employment category. Exercises: FOUND, NOT_FOUND, UNCLEAR, INFERRED,
 * EXPLICIT vs INFERRED consequences, specialized sections, a confirmed review.
 */
export const employmentContractAnalysis: AnalysisResult = {
  schemaVersion: ANALYSIS_SCHEMA_VERSION,
  document: {
    documentType: "EMPLOYMENT",
    documentSubtype: "Probationary employment contract",
    issuer: "Sampaguita Staffing Solutions Inc. (fictional)",
    classificationConfidence: 0.96,
  },
  overview:
    "This is a probationary employment contract for a Customer Support Associate. It sets your pay, a six-month probation, and rules for leaving the job. Two clauses need extra attention: a two-year non-compete and a penalty if you resign without 30 days' notice.",
  explanation:
    "By signing, you agree to work for the company as a Customer Support Associate for a monthly salary of PHP 18,500. For the first six months you are on probation. Either side can end the contract with 30 days' written notice, and you may owe one month's salary if you leave without giving it. After you leave, you agree not to work for a competitor for two years.",
  keyInformation: [
    {
      id: "ki-1",
      title: "Employer",
      explanation: "The company that is hiring you.",
      informationStatus: "FOUND",
      confidence: 0.97,
      basis: "Named in the opening paragraph.",
      evidenceIds: ["ev-1"],
      value: "Sampaguita Staffing Solutions Inc.",
    },
    {
      id: "ki-2",
      title: "Position",
      explanation: "Your job title under this contract.",
      informationStatus: "FOUND",
      confidence: 0.95,
      basis: null,
      evidenceIds: ["ev-2"],
      value: "Customer Support Associate",
    },
    {
      id: "ki-3",
      title: "Monthly basic salary",
      explanation: "Your fixed monthly pay before deductions.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: null,
      evidenceIds: ["ev-2"],
      value: "PHP 18,500.00",
    },
    {
      id: "ki-4",
      title: "Probationary period",
      explanation: "How long you are on probation after you are hired.",
      informationStatus: "FOUND",
      confidence: 0.94,
      basis: null,
      evidenceIds: ["ev-3"],
      value: "Six (6) months from the date of hiring",
    },
    {
      id: "ki-5",
      title: "Work schedule",
      explanation:
        "The contract does not say your working days or hours in the pages we could read.",
      informationStatus: "NOT_FOUND",
      confidence: null,
      basis: "No schedule text appears in the available pages.",
      evidenceIds: [],
      value: null,
    },
  ],
  obligations: [
    {
      id: "ob-1",
      title: "Give 30 days' written notice before leaving",
      explanation:
        "If you want to resign, you must tell the company in writing 30 days ahead.",
      informationStatus: "FOUND",
      confidence: 0.94,
      basis: null,
      evidenceIds: ["ev-5"],
      dueDate: null,
    },
    {
      id: "ob-2",
      title: "Do not work for a competitor for two years after leaving",
      explanation:
        "During employment and for two years after, you agree not to work for a competing company.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis: null,
      evidenceIds: ["ev-4"],
      dueDate: null,
    },
  ],
  watchouts: [
    {
      id: "wo-1",
      title: "Two-year non-compete clause",
      explanation:
        "This limits where you can work after leaving. Two years is long for a support role, so it is worth asking about.",
      informationStatus: "FOUND",
      confidence: 0.92,
      basis:
        "Rated HIGH because it restricts future work for a long period, not because of the wording.",
      evidenceIds: ["ev-4"],
      severity: "HIGH",
      watchoutType: "RESTRICTIVE_CLAUSE",
    },
    {
      id: "wo-2",
      title: "Penalty for leaving without notice",
      explanation:
        "If you do not give 30 days' written notice, you may have to pay the company one month of salary.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: "Stated directly in the termination clause.",
      evidenceIds: ["ev-6"],
      severity: "HIGH",
      watchoutType: "PENALTY",
    },
    {
      id: "wo-3",
      title: "Working hours are not stated",
      explanation:
        "Without a schedule in writing, you cannot tell your expected hours, shifts, or rest days.",
      informationStatus: "NOT_FOUND",
      confidence: null,
      basis: "No schedule text in the available pages.",
      evidenceIds: [],
      severity: "MEDIUM",
      watchoutType: "MISSING_INFORMATION",
    },
    {
      id: "wo-4",
      title: "Benefits are described only in general terms",
      explanation:
        "The contract says benefits required by law will be provided, but does not list them.",
      informationStatus: "UNCLEAR",
      confidence: 0.6,
      basis:
        "The wording is general, so specific benefits cannot be confirmed.",
      evidenceIds: ["ev-7"],
      severity: "LOW",
      watchoutType: "MISSING_INFORMATION",
    },
  ],
  consequences: [
    {
      id: "co-1",
      title: "You may owe one month's salary",
      explanation:
        "The contract states you would pay an amount equal to one month's salary if you resign without the required notice.",
      informationStatus: "FOUND",
      confidence: 0.93,
      basis: "Stated in the document.",
      evidenceIds: ["ev-6"],
      consequenceType: "EXPLICIT",
    },
    {
      id: "co-2",
      title: "The company may take action if you join a competitor",
      explanation:
        "The contract does not say what happens if you break the non-compete. It is reasonable to expect the company could object, but this is our interpretation, not something the document states.",
      informationStatus: "INFERRED",
      confidence: 0.55,
      basis: "Inferred from the existence of the non-compete clause.",
      evidenceIds: ["ev-4"],
      consequenceType: "INFERRED",
    },
  ],
  nextSteps: [
    {
      id: "ns-1",
      title: "Ask HR for your work schedule in writing",
      explanation:
        "Ask for your working days, hours, and rest days before you sign.",
      informationStatus: "FOUND",
      confidence: null,
      basis: "Suggested because the schedule is missing.",
      evidenceIds: ["ev-2"],
      stepType: "ASK",
    },
    {
      id: "ns-2",
      title: "Check the non-compete with a trusted adviser",
      explanation:
        "Consider asking a lawyer or the DOLE whether a two-year non-compete is reasonable for this job.",
      informationStatus: "INFERRED",
      confidence: null,
      basis: "Suggestion only. This is not a legal determination.",
      evidenceIds: ["ev-4"],
      stepType: "VERIFY",
    },
    {
      id: "ns-3",
      title: "Keep track of when probation ends",
      explanation:
        "Note your start date so you know when the six months finish.",
      informationStatus: "FOUND",
      confidence: null,
      basis: null,
      evidenceIds: ["ev-3"],
      stepType: "CHECKLIST",
    },
  ],
  importantDates: [
    {
      id: "dt-1",
      title: "End of probation",
      explanation:
        "Probation lasts six months, but the contract does not give a start date, so the end date cannot be calculated.",
      informationStatus: "UNCLEAR",
      confidence: 0.5,
      basis: "Start date is missing.",
      evidenceIds: ["ev-3"],
      date: null,
      dateType: "VALID_UNTIL",
    },
  ],
  specializedSections: [
    {
      id: "sec-comp",
      sectionKey: "compensation",
      title: "Compensation",
      summary: "What you are paid.",
      items: [
        {
          id: "sc-1",
          title: "Basic salary",
          explanation: "Fixed monthly pay.",
          informationStatus: "FOUND",
          confidence: 0.93,
          basis: null,
          evidenceIds: ["ev-2"],
          value: "PHP 18,500.00 per month",
          severity: null,
        },
        {
          id: "sc-2",
          title: "13th month pay",
          explanation: "Not mentioned in the available pages.",
          informationStatus: "NOT_FOUND",
          confidence: null,
          basis: null,
          evidenceIds: [],
          value: null,
          severity: null,
        },
      ],
    },
    {
      id: "sec-term",
      sectionKey: "termination",
      title: "Ending the contract",
      summary: "How either side can end the agreement.",
      items: [
        {
          id: "sc-3",
          title: "Notice period",
          explanation: "Written notice is needed from either side.",
          informationStatus: "FOUND",
          confidence: 0.94,
          basis: null,
          evidenceIds: ["ev-5"],
          value: "30 days, in writing",
          severity: null,
        },
        {
          id: "sc-4",
          title: "Penalty for no notice",
          explanation: "You may pay one month's salary.",
          informationStatus: "FOUND",
          confidence: 0.93,
          basis: null,
          evidenceIds: ["ev-6"],
          value: "One (1) month salary",
          severity: "HIGH",
        },
      ],
    },
  ],
  evidence: [
    {
      id: "ev-1",
      documentId,
      pageNumber: 1,
      excerpt:
        'This Contract of Employment is made between SAMPAGUITA STAFFING SOLUTIONS INC. (the "Company") and the Employee.',
      sourceType: "OCR_TEXT",
      wordStart: 0,
      wordEnd: 17,
    },
    {
      id: "ev-2",
      documentId,
      pageNumber: 1,
      excerpt:
        "Position: Customer Support Associate. Monthly basic salary: PHP 18,500.00",
      sourceType: "OCR_TEXT",
      wordStart: 42,
      wordEnd: 53,
    },
    {
      id: "ev-3",
      documentId,
      pageNumber: 2,
      excerpt:
        "The Employee shall render services for a probationary period of six (6) months from the date of hiring.",
      sourceType: "OCR_TEXT",
      wordStart: 5,
      wordEnd: 24,
    },
    {
      id: "ev-4",
      documentId,
      pageNumber: 2,
      excerpt:
        "The Employee shall not, during employment and for two (2) years after, work for any competitor of the Company.",
      sourceType: "OCR_TEXT",
      wordStart: 61,
      wordEnd: 80,
    },
    {
      id: "ev-5",
      documentId,
      pageNumber: 3,
      excerpt:
        "Either party may terminate this Contract by giving thirty (30) days written notice.",
      sourceType: "OCR_TEXT",
      wordStart: 3,
      wordEnd: 16,
    },
    {
      id: "ev-6",
      documentId,
      pageNumber: 3,
      excerpt:
        "Failure to render the required notice shall make the Employee liable to pay the Company an amount equivalent to one (1) month salary.",
      sourceType: "OCR_TEXT",
      wordStart: 17,
      wordEnd: 40,
    },
    {
      id: "ev-7",
      documentId,
      pageNumber: 2,
      excerpt: "The Company shall provide benefits required by law.",
      sourceType: "OCR_TEXT",
      wordStart: 30,
      wordEnd: 38,
    },
  ],
  limitations: [
    {
      id: "lim-1",
      text: "This is an explanation to help you understand the document. It is not legal advice. For legal questions, consult a lawyer or the proper government office.",
      scope: "ANALYSIS",
      pageNumbers: [],
    },
  ],
  reviewRequirements: [
    {
      id: "rr-1",
      field: "Probationary period",
      reason:
        "The number of months affects your rights. The text looks clear, but please confirm it matches your copy.",
      impact: "MEDIUM",
      pageNumber: 2,
      reviewStatus: "CONFIRMED",
      level: "OPTIONAL",
      evidenceIds: ["ev-3"],
    },
  ],
  analysisMetadata: {
    analyzedAt: "2026-11-15T09:30:00+08:00",
    modelInstanceId: "mock-instance",
    language: "en",
    totalPages: 3,
    pagesAnalyzed: 3,
    unavailablePages: [],
    isPartial: false,
  },
};
