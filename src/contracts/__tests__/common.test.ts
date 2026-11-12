import { describe, expect, it } from "vitest";
import {
  allowedMimeTypeSchema,
  canTransition,
  documentCategorySchema,
  documentLifecycleSchema,
  explanationLanguageSchema,
  informationStatusSchema,
  lifecycleToStage,
  processingStageSchema,
  relationshipTypeSchema,
  severitySchema,
} from "@/contracts/common";

type NamedSchema = {
  name: string;
  schema: { safeParse(value: unknown): { success: boolean } };
  accepts: readonly string[];
  rejects: readonly string[];
};

const SCHEMAS: NamedSchema[] = [
  {
    name: "severitySchema",
    schema: severitySchema,
    accepts: severitySchema.options,
    rejects: ["critical", "URGENT", ""],
  },
  {
    name: "informationStatusSchema",
    schema: informationStatusSchema,
    accepts: informationStatusSchema.options,
    rejects: ["found", "VERIFIED", ""],
  },
  {
    name: "documentLifecycleSchema",
    schema: documentLifecycleSchema,
    accepts: documentLifecycleSchema.options,
    rejects: ["uploaded", "DONE", ""],
  },
  {
    name: "documentCategorySchema",
    schema: documentCategorySchema,
    accepts: documentCategorySchema.options,
    rejects: ["financial", "HEALTH", ""],
  },
  {
    name: "relationshipTypeSchema",
    schema: relationshipTypeSchema,
    accepts: relationshipTypeSchema.options,
    rejects: ["possible_match", "ENEMY", ""],
  },
  {
    name: "explanationLanguageSchema",
    schema: explanationLanguageSchema,
    accepts: explanationLanguageSchema.options,
    rejects: ["en", "ENGLISH", ""],
  },
  {
    name: "processingStageSchema",
    schema: processingStageSchema,
    accepts: processingStageSchema.options,
    rejects: ["reading", "DONE", ""],
  },
];

describe.each(SCHEMAS)("$name", ({ schema, accepts, rejects }) => {
  it("accepts each enum value", () => {
    for (const value of accepts) {
      expect(schema.safeParse(value).success).toBe(true);
    }
  });

  it("rejects lowercase, unknown, and empty values", () => {
    for (const value of rejects) {
      expect(schema.safeParse(value).success).toBe(false);
    }
  });

  it("rejects empty input", () => {
    expect(schema.safeParse("").success).toBe(false);
  });
});

describe("documentLifecycleSchema", () => {
  it("starts with AWAITING_UPLOAD", () => {
    expect(documentLifecycleSchema.options[0]).toBe("AWAITING_UPLOAD");
  });
});

describe("lifecycleToStage", () => {
  it("maps pre-upload and upload states to RECEIVED", () => {
    expect(lifecycleToStage("AWAITING_UPLOAD")).toBe("RECEIVED");
    expect(lifecycleToStage("UPLOADED")).toBe("RECEIVED");
  });

  it("maps every OCR state to READING", () => {
    for (const lifecycle of [
      "OCR_PROCESSING",
      "OCR_READY",
      "OCR_PARTIAL",
      "OCR_FAILED",
    ] as const) {
      expect(lifecycleToStage(lifecycle)).toBe("READING");
    }
  });

  it("maps ANALYZING by job step, defaulting to UNDERSTANDING", () => {
    expect(lifecycleToStage("ANALYZING", 1)).toBe("UNDERSTANDING");
    expect(lifecycleToStage("ANALYZING", 2)).toBe("CHECKING_DETAILS");
    expect(lifecycleToStage("ANALYZING", 3)).toBe("PREPARING_REPORT");
    expect(lifecycleToStage("ANALYZING")).toBe("UNDERSTANDING");
    expect(lifecycleToStage("ANALYZING", 99)).toBe("UNDERSTANDING");
  });

  it("returns PREPARING_REPORT for every post-analysis state", () => {
    for (const lifecycle of [
      "NEEDS_CORRECTION",
      "REVIEW_REQUIRED",
      "ANALYSIS_FAILED",
      "COMPLETED",
    ] as const) {
      expect(lifecycleToStage(lifecycle)).toBe("PREPARING_REPORT");
    }
  });
});

describe("allowedMimeTypeSchema", () => {
  it("accepts PDF, JPEG, PNG, TIFF, and WebP", () => {
    for (const mime of [
      "application/pdf",
      "image/jpeg",
      "image/png",
      "image/tiff",
      "image/webp",
    ]) {
      expect(allowedMimeTypeSchema.safeParse(mime).success).toBe(true);
    }
  });

  it("rejects text/plain and other types", () => {
    for (const mime of ["text/plain", "text/markdown", "image/gif", ""]) {
      expect(allowedMimeTypeSchema.safeParse(mime).success).toBe(false);
    }
  });
});

describe("canTransition", () => {
  const ALLOWED: [string, string][] = [
    ["AWAITING_UPLOAD", "UPLOADED"],
    ["UPLOADED", "OCR_PROCESSING"],
    ["OCR_PROCESSING", "OCR_READY"],
    ["OCR_PROCESSING", "OCR_PARTIAL"],
    ["OCR_PROCESSING", "OCR_FAILED"],
    ["OCR_READY", "ANALYZING"],
    ["OCR_PARTIAL", "ANALYZING"],
    ["OCR_PARTIAL", "OCR_PROCESSING"],
    ["OCR_FAILED", "OCR_PROCESSING"],
    ["ANALYZING", "NEEDS_CORRECTION"],
    ["ANALYZING", "REVIEW_REQUIRED"],
    ["ANALYZING", "COMPLETED"],
    ["ANALYZING", "ANALYSIS_FAILED"],
    ["NEEDS_CORRECTION", "ANALYZING"],
    ["REVIEW_REQUIRED", "ANALYZING"],
    ["REVIEW_REQUIRED", "COMPLETED"],
    ["COMPLETED", "ANALYZING"],
    ["ANALYSIS_FAILED", "ANALYZING"],
  ];

  it("returns true for exactly the allowed pairs", () => {
    for (const [from, to] of ALLOWED) {
      expect(canTransition(from as never, to as never)).toBe(true);
    }
  });

  it("returns false for every other pair, including ANALYSIS_FAILED → COMPLETED", () => {
    const states = documentLifecycleSchema.options;
    const allowed = new Set(ALLOWED.map(([f, t]) => `${f}>${t}`));
    for (const from of states) {
      for (const to of states) {
        if (allowed.has(`${from}>${to}`)) continue;
        expect(
          [from, to].join(">") && canTransition(from as never, to as never),
        ).toBe(false);
      }
    }
  });
});
