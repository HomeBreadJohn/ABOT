import { z } from "zod";

import {
  allowedMimeTypeSchema,
  analysisResultSchema,
  documentCategorySchema,
  documentDetailResponseSchema,
  documentLifecycleSchema,
  documentListItemSchema,
  informationStatusSchema,
  lifecycleToStage,
  reminderSchema,
} from "@/contracts";
import type {
  DeadlineSignal,
  DocumentsSchemaProfile,
} from "./documents-service";
import type { LatestAnalysis } from "@/features/documents/view-models/analysis-status";

/** A row returned by Supabase. Keeping this boundary unknown prevents database
 * values from being trusted before they have passed the shared contracts. */
export type SupabaseRow = Readonly<Record<string, unknown>>;

type DocumentListItem = z.infer<typeof documentListItemSchema>;
type DocumentDetail = z.infer<typeof documentDetailResponseSchema>;
type Reminder = z.infer<typeof reminderSchema>;

export type MappedDocumentSummary = DocumentListItem & {
  readonly status: DocumentListItem["lifecycle"];
  readonly originalFilename: string;
  readonly mimeType: DocumentDetail["mimeType"];
  readonly fileSize: number;
  readonly subtype: string | null;
  readonly pageCount: number | null;
  readonly failureReason: string | null;
  readonly uploadedAt: string;
  readonly latestAnalysis: LatestAnalysis | null;
  readonly deadlines: readonly {
    readonly title: string;
    readonly date: string | null;
  }[];
  readonly canRetry: boolean;
};

export type MappedDocumentDetail = DocumentDetail & {
  readonly status: DocumentDetail["lifecycle"];
  readonly uploadedAt: string;
  readonly pageCount: number | null;
  readonly failureReason: string | null;
  readonly latestAnalysis: LatestAnalysis | null;
  readonly deadlines: readonly {
    readonly title: string;
    readonly date: string | null;
  }[];
  readonly canRetry: boolean;
};

export interface DocumentMapperCapabilities {
  readonly reminders: boolean;
  readonly deadlineCertainty: boolean;
}

export const DOCUMENT_MAPPER_CAPABILITIES: Readonly<
  Record<DocumentsSchemaProfile, DocumentMapperCapabilities>
> = {
  initial: { reminders: false, deadlineCertainty: false },
  lifecycle: { reminders: true, deadlineCertainty: true },
};

export function capabilitiesForProfile(
  profile: DocumentsSchemaProfile,
): DocumentMapperCapabilities {
  return DOCUMENT_MAPPER_CAPABILITIES[profile];
}

const INITIAL_STATUS_MAP = {
  uploading: "UPLOADED",
  pending: "UPLOADED",
  processing: "OCR_PROCESSING",
  completed: "COMPLETED",
  failed: "ANALYSIS_FAILED",
} as const;

type InitialStatus = keyof typeof INITIAL_STATUS_MAP;

/**
 * Maps every status in the applied initial migration. Unknown values return
 * null so callers can skip the row instead of displaying an invented status.
 */
export function mapInitialDocumentStatus(
  value: unknown,
): DocumentListItem["lifecycle"] | null {
  if (typeof value !== "string") return null;
  return INITIAL_STATUS_MAP[value as InitialStatus] ?? null;
}

export function mapDocumentStatus(
  value: unknown,
  profile: DocumentsSchemaProfile,
): DocumentListItem["lifecycle"] | null {
  if (profile === "initial") return mapInitialDocumentStatus(value);

  const parsed = documentLifecycleSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function asRow(value: unknown): SupabaseRow | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as SupabaseRow)
    : null;
}

function firstValue(row: SupabaseRow, ...keys: readonly string[]): unknown {
  for (const key of keys) {
    if (key in row) return row[key];
  }
  return undefined;
}

function requiredString(
  row: SupabaseRow,
  ...keys: readonly string[]
): string | null {
  const value = firstValue(row, ...keys);
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function optionalString(
  row: SupabaseRow,
  ...keys: readonly string[]
): string | null {
  const value = firstValue(row, ...keys);
  if (value === undefined || value === null) return null;
  return typeof value === "string" ? value : null;
}

function optionalNumber(
  row: SupabaseRow,
  ...keys: readonly string[]
): number | null {
  const value = firstValue(row, ...keys);
  if (value === undefined || value === null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function cleanFilename(value: string): string {
  return value
    .replace(/[\\/]/gu, " ")
    .replace(/[\u0000-\u001f\u007f]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

/** Derives a non-empty, display-safe title without exposing a storage path. */
export function deriveDocumentTitle(originalFilename: string): string {
  const filename = cleanFilename(originalFilename);
  const basename = filename.split("/").at(-1) ?? filename;
  const stem = basename.replace(/\.[^.]+$/u, "").trim();
  return stem || basename || "Untitled document";
}

function titleForRow(
  row: SupabaseRow,
  originalFilename: string,
  profile: DocumentsSchemaProfile,
): string {
  if (profile === "lifecycle") {
    const title = firstValue(row, "title");
    if (typeof title === "string" && title.trim()) return title.trim();
  }
  return deriveDocumentTitle(originalFilename);
}

function categoryForRow(
  row: SupabaseRow,
  profile: DocumentsSchemaProfile,
): DocumentListItem["category"] {
  if (profile === "initial") return null;
  const value = firstValue(row, "category");
  if (value === undefined || value === null || value === "") return null;
  const parsed = documentCategorySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function optionalLifecycleNumber(
  row: SupabaseRow,
  ...keys: readonly string[]
): number | null {
  const value = optionalNumber(row, ...keys);
  return value !== null && Number.isInteger(value) && value >= 1 ? value : null;
}

function optionalLifecycleText(
  row: SupabaseRow,
  ...keys: readonly string[]
): string | null {
  const value = optionalString(row, ...keys);
  return value?.trim() || null;
}

export interface DocumentMapperOptions {
  /** One joined analysis row, or analysis rows from which the newest is chosen. */
  readonly latestAnalysis?: unknown;
  readonly analysisRows?: readonly unknown[];
}

export type DocumentAnalysisInput =
  | unknown
  | readonly unknown[]
  | ReadonlyMap<string, unknown>
  | Readonly<Record<string, unknown>>;

function analysisDocumentId(analysis: SupabaseRow): string | null {
  return requiredString(analysis, "document_id", "documentId");
}

function analysisVersion(analysis: SupabaseRow): number {
  const value = optionalNumber(analysis, "version");
  return value !== null && Number.isFinite(value) ? value : 0;
}

function analysisCandidates(value: unknown): SupabaseRow[] {
  if (Array.isArray(value)) {
    return value.map(asRow).filter((row): row is SupabaseRow => row !== null);
  }
  const row = asRow(value);
  return row ? [row] : [];
}

function newestAnalysis(
  documentId: string,
  candidates: readonly SupabaseRow[],
): SupabaseRow | null {
  return (
    candidates
      .filter((candidate) => {
        const candidateDocumentId = analysisDocumentId(candidate);
        return (
          candidateDocumentId === null || candidateDocumentId === documentId
        );
      })
      .sort(
        (left, right) =>
          analysisVersion(right) - analysisVersion(left) ||
          (
            optionalString(right, "completed_at", "completedAt") ?? ""
          ).localeCompare(
            optionalString(left, "completed_at", "completedAt") ?? "",
          ) ||
          (requiredString(left, "id") ?? "").localeCompare(
            requiredString(right, "id") ?? "",
          ),
      )[0] ?? null
  );
}

function analysisFromInput(
  row: SupabaseRow,
  documentId: string,
  options: DocumentMapperOptions,
): SupabaseRow | null {
  const joined = firstValue(
    row,
    "latest_analysis",
    "latestAnalysis",
    "analysis",
  );
  if (joined !== undefined) {
    return newestAnalysis(documentId, analysisCandidates(joined));
  }

  const nested = firstValue(row, "document_analyses", "analyses");
  if (nested !== undefined) {
    return newestAnalysis(documentId, analysisCandidates(nested));
  }

  if (options.latestAnalysis !== undefined) {
    return newestAnalysis(
      documentId,
      analysisCandidates(options.latestAnalysis),
    );
  }
  return newestAnalysis(
    documentId,
    options.analysisRows ? analysisCandidates(options.analysisRows) : [],
  );
}

function analysisStatus(
  analysis: SupabaseRow | null,
): DocumentListItem["analysisStatus"] {
  const status = optionalString(analysis ?? {}, "status")?.toUpperCase();
  switch (status) {
    case "RUNNING":
      return "RUNNING";
    case "SUCCEEDED":
      return "SUCCEEDED";
    case "FAILED":
      return "FAILED";
    default:
      return "NONE";
  }
}

function latestAnalysisView(
  analysis: SupabaseRow | null,
): LatestAnalysis | null {
  const status = analysisStatus(analysis);
  if (status === "NONE") return null;
  return {
    status:
      status === "SUCCEEDED"
        ? "COMPLETED"
        : status === "RUNNING"
          ? "RUNNING"
          : "FAILED",
    completedAt: optionalString(analysis ?? {}, "completed_at", "completedAt"),
  };
}

function validDateValue(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function reportFromAnalysis(
  analysis: SupabaseRow | null,
): z.infer<typeof analysisResultSchema> | null {
  if (!analysis || analysisStatus(analysis) !== "SUCCEEDED") return null;
  const report = firstValue(analysis, "report_json", "reportJson");
  const parsed = analysisResultSchema.safeParse(report);
  return parsed.success ? parsed.data : null;
}

function rawImportantDates(report: SupabaseRow | null): readonly SupabaseRow[] {
  const rawReport = report
    ? firstValue(report, "report_json", "reportJson")
    : undefined;
  const reportRow = asRow(rawReport);
  const dates = reportRow
    ? firstValue(reportRow, "importantDates", "important_dates")
    : undefined;
  return Array.isArray(dates)
    ? dates.map(asRow).filter((row): row is SupabaseRow => row !== null)
    : [];
}

function deadlineSignalsForAnalysis(
  documentId: string,
  analysis: SupabaseRow | null,
  provisional: boolean,
): DeadlineSignal[] {
  const report = reportFromAnalysis(analysis);
  if (!report) return [];

  const rawDates = rawImportantDates(analysis);
  return report.importantDates.flatMap((date, index) => {
    const rawDate = rawDates[index];
    const rawType = rawDate
      ? firstValue(rawDate, "dateType", "date_type")
      : undefined;
    if (rawType !== undefined && rawType !== "DEADLINE") return [];

    const informationStatus = informationStatusSchema.safeParse(
      date.informationStatus,
    );
    if (!informationStatus.success) return [];

    return [
      {
        documentId,
        sourceItemId: date.id,
        title: date.title,
        date: validDateValue(date.date),
        informationStatus: informationStatus.data,
        provisional,
      },
    ];
  });
}

/** Maps deadline evidence from one completed lifecycle analysis. */
export function mapAnalysisDeadlineSignals(
  documentId: string,
  analysis: unknown,
  provisional = false,
): DeadlineSignal[] {
  return deadlineSignalsForAnalysis(
    documentId,
    newestAnalysis(documentId, analysisCandidates(analysis)),
    provisional,
  );
}

function deadlineSummaries(
  signals: readonly DeadlineSignal[],
): readonly { readonly title: string; readonly date: string | null }[] {
  return signals.map(({ title, date }) => ({ title, date }));
}

function earliestDeadline(
  deadlines: readonly {
    readonly title: string;
    readonly date: string | null;
  }[],
): string | null {
  return (
    deadlines
      .map((deadline) => deadline.date)
      .filter((date): date is string => date !== null)
      .sort((left, right) => left.localeCompare(right))[0] ?? null
  );
}

function retryableStatus(
  status: DocumentListItem["lifecycle"],
  profile: DocumentsSchemaProfile,
): boolean {
  return (
    profile === "lifecycle" &&
    ["OCR_FAILED", "OCR_PARTIAL", "ANALYSIS_FAILED"].includes(status)
  );
}

function statusNeedsAttention(
  status: DocumentListItem["lifecycle"],
  analysis: DocumentListItem["analysisStatus"],
): boolean {
  return (
    [
      "NEEDS_CORRECTION",
      "REVIEW_REQUIRED",
      "OCR_PARTIAL",
      "OCR_FAILED",
      "ANALYSIS_FAILED",
    ].includes(status) || analysis === "FAILED"
  );
}

function baseDocumentValues(
  row: SupabaseRow,
  profile: DocumentsSchemaProfile,
  options: DocumentMapperOptions,
): {
  readonly summary: MappedDocumentSummary;
  readonly detail: MappedDocumentDetail;
  readonly signals: readonly DeadlineSignal[];
} | null {
  const documentId = requiredString(row, "id", "document_id", "documentId");
  const originalFilename = requiredString(
    row,
    "original_filename",
    "originalFilename",
  );
  const mimeType = requiredString(row, "mime_type", "mimeType");
  const createdAt = requiredString(row, "created_at", "createdAt");
  const updatedAt = requiredString(row, "updated_at", "updatedAt") ?? createdAt;
  const fileSize = optionalNumber(row, "file_size", "fileSize");
  const rawStatus = firstValue(
    row,
    "processing_status",
    "processingStatus",
    "status",
  );

  if (
    documentId === null ||
    originalFilename === null ||
    mimeType === null ||
    createdAt === null ||
    fileSize === null
  ) {
    return null;
  }

  const lifecycle = mapDocumentStatus(rawStatus, profile);
  if (lifecycle === null) return null;

  const mime = allowedMimeTypeSchema.safeParse(mimeType);
  if (!mime.success || !Number.isInteger(fileSize) || fileSize <= 0)
    return null;

  const analysis =
    profile === "lifecycle"
      ? analysisFromInput(row, documentId, options)
      : null;
  const mappedAnalysisStatus =
    profile === "lifecycle" ? analysisStatus(analysis) : "NONE";
  const latestAnalysis =
    profile === "lifecycle" ? latestAnalysisView(analysis) : null;
  const signals =
    profile === "lifecycle"
      ? deadlineSignalsForAnalysis(
          documentId,
          analysis,
          lifecycle === "NEEDS_CORRECTION",
        )
      : [];
  const deadlines = deadlineSummaries(signals);
  const category = categoryForRow(row, profile);
  if (
    profile === "lifecycle" &&
    firstValue(row, "category") !== undefined &&
    firstValue(row, "category") !== null &&
    firstValue(row, "category") !== "" &&
    category === null
  ) {
    return null;
  }
  const title = titleForRow(row, originalFilename, profile);
  const pageCount =
    profile === "lifecycle"
      ? optionalLifecycleNumber(row, "page_count", "pageCount")
      : null;
  const failureReason =
    profile === "lifecycle"
      ? optionalLifecycleText(row, "failure_reason", "failureReason")
      : null;
  const status = lifecycle;
  const canRetry = retryableStatus(status, profile);
  const needsAttention = statusNeedsAttention(status, mappedAnalysisStatus);
  const stage = lifecycleToStage(
    lifecycle,
    optionalNumber(row, "job_step", "jobStep", "step") ?? undefined,
  );
  const nextDeadline = earliestDeadline(deadlines);

  const listCandidate = {
    documentId,
    title,
    lifecycle,
    stage,
    category,
    analysisStatus: mappedAnalysisStatus,
    nextDeadline,
    needsAttention,
    createdAt,
  };
  const parsedList = documentListItemSchema.safeParse(listCandidate);
  if (!parsedList.success) return null;

  const detailCandidate = {
    ...parsedList.data,
    subtype:
      profile === "lifecycle" ? optionalLifecycleText(row, "subtype") : null,
    mimeType: mime.data,
    fileSize,
    originalFilename,
    updatedAt,
    latestAnalysisId:
      profile === "lifecycle" ? optionalString(analysis ?? {}, "id") : null,
  };
  const parsedDetail = documentDetailResponseSchema.safeParse(detailCandidate);
  if (!parsedDetail.success) return null;

  const shared = {
    status,
    originalFilename,
    mimeType: mime.data,
    fileSize,
    subtype: parsedDetail.data.subtype,
    pageCount,
    failureReason,
    uploadedAt: createdAt,
    latestAnalysis,
    deadlines,
    canRetry,
  } as const;

  return {
    summary: { ...parsedList.data, ...shared },
    detail: { ...parsedDetail.data, ...shared },
    signals,
  };
}

export function mapDocumentRow(
  row: unknown,
  profile: DocumentsSchemaProfile,
  options: DocumentMapperOptions = {},
): MappedDocumentSummary | null {
  const parsedRow = asRow(row);
  if (!parsedRow) return null;
  return baseDocumentValues(parsedRow, profile, options)?.summary ?? null;
}

export function mapInitialDocumentRow(
  row: unknown,
  options: DocumentMapperOptions = {},
): MappedDocumentSummary | null {
  return mapDocumentRow(row, "initial", options);
}

export function mapLifecycleDocumentRow(
  row: unknown,
  options: DocumentMapperOptions = {},
): MappedDocumentSummary | null {
  return mapDocumentRow(row, "lifecycle", options);
}

export function mapDocumentDetailRow(
  row: unknown,
  profile: DocumentsSchemaProfile,
  options: DocumentMapperOptions = {},
): MappedDocumentDetail | null {
  const parsedRow = asRow(row);
  if (!parsedRow) return null;
  return baseDocumentValues(parsedRow, profile, options)?.detail ?? null;
}

export interface MappedDocumentRows {
  readonly documents: readonly MappedDocumentSummary[];
  readonly skippedCount: number;
}

function optionsForDocument(
  input: DocumentAnalysisInput | undefined,
  documentId: string,
): DocumentMapperOptions {
  if (input === undefined) return {};
  if (input instanceof Map) {
    return { latestAnalysis: input.get(documentId) };
  }
  if (Array.isArray(input)) return { analysisRows: input };
  const row = asRow(input);
  if (row && documentId in row) return { latestAnalysis: row[documentId] };
  return { latestAnalysis: input };
}

/** Maps a list and reports, rather than throws for, rows that fail validation. */
export function mapDocumentRows(
  rows: readonly unknown[],
  profile: DocumentsSchemaProfile,
  analyses?: DocumentAnalysisInput,
): MappedDocumentRows {
  const documents: MappedDocumentSummary[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const parsedRow = asRow(row);
    const documentId = parsedRow
      ? requiredString(parsedRow, "id", "document_id", "documentId")
      : null;
    const mapped = mapDocumentRow(
      row,
      profile,
      optionsForDocument(analyses, documentId ?? ""),
    );
    if (mapped) documents.push(mapped);
    else skippedCount += 1;
  }

  return { documents, skippedCount };
}

export interface MappedDocumentDetails {
  readonly documents: readonly MappedDocumentDetail[];
  readonly skippedCount: number;
}

export function mapDocumentDetailRows(
  rows: readonly unknown[],
  profile: DocumentsSchemaProfile,
  analyses?: DocumentAnalysisInput,
): MappedDocumentDetails {
  const documents: MappedDocumentDetail[] = [];
  let skippedCount = 0;

  for (const row of rows) {
    const parsedRow = asRow(row);
    const documentId = parsedRow
      ? requiredString(parsedRow, "id", "document_id", "documentId")
      : null;
    const mapped = mapDocumentDetailRow(
      row,
      profile,
      optionsForDocument(analyses, documentId ?? ""),
    );
    if (mapped) documents.push(mapped);
    else skippedCount += 1;
  }

  return { documents, skippedCount };
}

/** Maps the current reminders table to the read-only reminder contract. */
export function mapReminderRows(
  rows: readonly unknown[],
  profile: DocumentsSchemaProfile,
): readonly Reminder[] {
  if (!capabilitiesForProfile(profile).reminders) return [];

  return rows.flatMap((value) => {
    const row = asRow(value);
    if (!row) return [];
    const status = optionalString(row, "status")?.toUpperCase();
    const mappedStatus =
      status === "PENDING"
        ? "ACTIVE"
        : status === "SENT"
          ? "DONE"
          : status === "DISMISSED"
            ? "DISMISSED"
            : null;
    const candidate = {
      id: requiredString(row, "id"),
      documentId: optionalString(row, "document_id", "documentId"),
      title: requiredString(row, "title"),
      dueAt: requiredString(row, "due_at", "dueAt"),
      status: mappedStatus,
      notes: optionalString(row, "description", "notes"),
    };
    const parsed = reminderSchema.safeParse(candidate);
    return parsed.success ? [parsed.data] : [];
  });
}
