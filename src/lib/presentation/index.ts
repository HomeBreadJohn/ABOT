/**
 * View-only presentation values for domain values owned by another boundary.
 *
 * The adapter deliberately accepts `unknown` raw values and does not import the
 * analysis contract. This keeps display semantics reusable while the contract
 * remains independently owned and subject to change.
 */

export const PRESENTATION_CATEGORIES = [
  "status",
  "severity",
  "certainty",
] as const;

export type PresentationCategory = (typeof PRESENTATION_CATEGORIES)[number];

export const PRESENTATION_TONES = [
  "neutral",
  "positive",
  "informative",
  "caution",
  "critical",
] as const;

export type PresentationTone = (typeof PRESENTATION_TONES)[number];

/**
 * A serializable descriptor that is safe to pass across a server/client
 * boundary. Unknown values intentionally omit category metadata.
 */
export interface PresentationView {
  readonly category?: PresentationCategory;
  readonly categoryLabel?: string;
  readonly label: string;
  readonly cue: string;
  readonly tone: PresentationTone;
  readonly supported: boolean;
}

export interface PresentationAdapterInput {
  readonly category: PresentationCategory;
  readonly value: unknown;
}

interface SupportedPresentationValue {
  readonly label: string;
  readonly cue: string;
  readonly tone: PresentationTone;
}

const CATEGORY_LABELS: Record<PresentationCategory, string> = {
  status: "Status",
  severity: "Severity",
  certainty: "Certainty",
};

const SUPPORTED_VALUES: Record<
  PresentationCategory,
  Readonly<Record<string, SupportedPresentationValue>>
> = {
  status: {
    ACTIVE: { label: "Active", cue: "●", tone: "informative" },
    ANALYZING: { label: "Analyzing", cue: "…", tone: "informative" },
    ANALYSIS_FAILED: { label: "Analysis failed", cue: "!", tone: "critical" },
    CANCELLED: { label: "Cancelled", cue: "×", tone: "caution" },
    COMPLETED: { label: "Completed", cue: "✓", tone: "positive" },
    CONFLICTING: { label: "Conflicting", cue: "↔", tone: "caution" },
    FAILED: { label: "Failed", cue: "!", tone: "critical" },
    FOUND: { label: "Found", cue: "✓", tone: "positive" },
    INACTIVE: { label: "Inactive", cue: "○", tone: "neutral" },
    INFERRED: { label: "Inferred", cue: "≈", tone: "caution" },
    NEEDS_CORRECTION: {
      label: "Needs correction",
      cue: "✎",
      tone: "caution",
    },
    NOT_FOUND: { label: "Not found", cue: "—", tone: "caution" },
    OCR_FAILED: { label: "OCR failed", cue: "!", tone: "critical" },
    OCR_PARTIAL: { label: "OCR partial", cue: "◐", tone: "caution" },
    OCR_PROCESSING: { label: "OCR processing", cue: "…", tone: "informative" },
    OCR_READY: { label: "OCR ready", cue: "✓", tone: "positive" },
    PENDING: { label: "Pending", cue: "…", tone: "caution" },
    QUEUED: { label: "Queued", cue: "…", tone: "informative" },
    REVIEW_REQUIRED: {
      label: "Review required",
      cue: "!",
      tone: "caution",
    },
    RUNNING: { label: "Running", cue: "…", tone: "informative" },
    SUCCESS: { label: "Success", cue: "✓", tone: "positive" },
    UNCLEAR: { label: "Unclear", cue: "?", tone: "caution" },
    UPLOADED: { label: "Uploaded", cue: "↑", tone: "informative" },
  },
  severity: {
    CRITICAL: { label: "Critical", cue: "‼", tone: "critical" },
    HIGH: { label: "High", cue: "!", tone: "critical" },
    LOW: { label: "Low", cue: "•", tone: "informative" },
    MEDIUM: { label: "Medium", cue: "△", tone: "caution" },
  },
  certainty: {
    CERTAIN: { label: "Certain", cue: "✓", tone: "positive" },
    HIGH: { label: "High", cue: "✓", tone: "positive" },
    INFERRED: { label: "Inferred", cue: "≈", tone: "caution" },
    LOW: { label: "Low", cue: "?", tone: "caution" },
    MEDIUM: { label: "Medium", cue: "~", tone: "caution" },
    UNCERTAIN: { label: "Uncertain", cue: "?", tone: "caution" },
  },
};

const UNKNOWN_PRESENTATION: PresentationView = {
  label: "Unknown value",
  cue: "?",
  tone: "neutral",
  supported: false,
};

function normalizeRawValue(value: unknown): string | undefined {
  if (typeof value === "string") {
    const normalized = value.trim().toUpperCase();
    return normalized.length > 0 ? normalized : undefined;
  }

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value).toUpperCase();
  }

  return undefined;
}

function isPresentationCategory(value: unknown): value is PresentationCategory {
  return (
    typeof value === "string" &&
    (PRESENTATION_CATEGORIES as readonly string[]).includes(value)
  );
}

/**
 * Adapt a category and opaque raw value into a stable, serializable view.
 * Unsupported values are normal input and always receive the neutral fallback.
 */
export function adaptPresentationValue(
  input: PresentationAdapterInput,
): PresentationView {
  if (!isPresentationCategory(input.category)) {
    return UNKNOWN_PRESENTATION;
  }

  const rawValue = normalizeRawValue(input.value);
  const supportedValue = rawValue
    ? SUPPORTED_VALUES[input.category][rawValue]
    : undefined;

  if (!supportedValue) {
    return UNKNOWN_PRESENTATION;
  }

  return {
    category: input.category,
    categoryLabel: CATEGORY_LABELS[input.category],
    label: supportedValue.label,
    cue: supportedValue.cue,
    tone: supportedValue.tone,
    supported: true,
  };
}

/**
 * Convenience form for callers that already keep category and raw value as
 * separate variables.
 */
export function presentValue(
  category: PresentationCategory,
  value: unknown,
): PresentationView {
  return adaptPresentationValue({ category, value });
}

export const UNKNOWN_PRESENTATION_VALUE = UNKNOWN_PRESENTATION;
