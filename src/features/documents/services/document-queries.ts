import "server-only";

import type { z } from "zod";

import {
  analysisByIdResponseSchema,
  analysisResponseSchema,
  documentDetailResponseSchema,
  documentListResponseSchema,
  documentPageResponseSchema,
  lifecycleToStage,
  parseAnalysisResult,
  type AllowedMimeType,
  type DocumentCategory,
  type DocumentLifecycle,
  type ExplanationLanguage,
} from "@/contracts";
import { modulesDiffer } from "@/features/intelligence/modules/registry";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";
import {
  enqueueJob,
  kickJobRunner,
} from "@/features/processing/services/job-runner";

const STALE_JOB_MS = 2 * 60_000;
const ATTENTION_WINDOW_MS = 7 * 24 * 60 * 60_000;

/** Lifecycle states that always need the user's attention. */
const ATTENTION_LIFECYCLES = new Set<DocumentLifecycle>([
  "NEEDS_CORRECTION",
  "REVIEW_REQUIRED",
  "OCR_FAILED",
  "ANALYSIS_FAILED",
]);

type AnalysisStatus = "NONE" | "RUNNING" | "SUCCEEDED" | "FAILED";

type DocumentRow = {
  id: string;
  user_id: string;
  title: string | null;
  original_filename: string;
  processing_status: string;
  category: string | null;
  subtype: string | null;
  mime_type: string;
  file_size: number;
  created_at: string;
  updated_at: string;
};

type AnalysisRow = {
  id: string;
  status: string;
  version?: number;
  report_json?: unknown;
};

type PageRow = {
  page_number: number;
  ocr_status: string;
  extracted_text: string;
  average_confidence: number | null;
  page_metadata: unknown;
};

/**
 * Data-access seam. Each query is overridable so unit tests run against
 * in-memory fakes. Production wiring is built by defaultDeps().
 */
export type DocumentQueryDeps = {
  now?: () => Date;
  listRows?: (userId: string) => Promise<DocumentRow[]>;
  latestAnalysisStatus?: (
    userId: string,
    documentId: string,
  ) => Promise<AnalysisStatus>;
  nextDeadline?: (userId: string, documentId: string) => Promise<string | null>;
  getRow?: (userId: string, documentId: string) => Promise<DocumentRow | null>;
  latestAnalysisRow?: (
    userId: string,
    documentId: string,
  ) => Promise<AnalysisRow | null>;
  oldestQueuedJobAge?: (
    userId: string,
    documentId: string,
  ) => Promise<number | null>;
  analysisById?: (
    userId: string,
    analysisId: string,
  ) => Promise<
    | {
        id: string;
        document_id: string;
        version: number;
        status: string;
        completed_at: string | null;
        report_json: unknown;
      }
    | null
  >;
  getPageRow?: (
    userId: string,
    documentId: string,
    pageNumber: number,
  ) => Promise<PageRow | null>;
  kick?: (origin: string) => void;
};

/**
 * Vault list for the current user. Needs-attention documents come first, then
 * the nearest upcoming deadline, then the newest. analysisStatus is read from
 * the latest analysis row (NONE when there is none).
 */
export async function listDocuments(
  userId: string,
  deps: DocumentQueryDeps = defaultDeps(),
) {
  const now = (deps.now ?? (() => new Date()))();
  const rows = await (deps.listRows ?? listRows)(userId);

  const items = await Promise.all(
    rows.map(async (row) => {
      const [analysisStatus, nextDeadline] = await Promise.all([
        (deps.latestAnalysisStatus ?? latestAnalysisStatus)(userId, row.id),
        (deps.nextDeadline ?? nextDeadline_)(userId, row.id),
      ]);
      const lifecycle = row.processing_status as DocumentLifecycle;
      const deadlineMs = nextDeadline ? Date.parse(nextDeadline) : null;
      const deadlineSoon =
        deadlineMs !== null &&
        deadlineMs - now.getTime() <= ATTENTION_WINDOW_MS &&
        deadlineMs - now.getTime() >= -ATTENTION_WINDOW_MS;
      const needsAttention =
        ATTENTION_LIFECYCLES.has(lifecycle) || deadlineSoon;

      return {
        item: {
          documentId: row.id,
          title: row.title ?? row.original_filename,
          lifecycle,
          stage: lifecycleToStage(lifecycle),
          category: (row.category as DocumentCategory | null) ?? null,
          analysisStatus,
          nextDeadline,
          needsAttention,
          createdAt: row.created_at,
        },
        sortDeadlineMs: deadlineMs,
      };
    }),
  );

  items.sort((a, b) => {
    // 1. Needs attention first.
    if (a.item.needsAttention !== b.item.needsAttention)
      return a.item.needsAttention ? -1 : 1;
    // 2. Nearest deadline (a document with a deadline beats one without).
    if (a.sortDeadlineMs !== b.sortDeadlineMs) {
      if (a.sortDeadlineMs === null) return 1;
      if (b.sortDeadlineMs === null) return -1;
      return a.sortDeadlineMs - b.sortDeadlineMs;
    }
    // 3. Newest first.
    return Date.parse(b.item.createdAt) - Date.parse(a.item.createdAt);
  });

  return documentListResponseSchema.parse({
    documents: items.map((i) => i.item),
  });
}

/** Document detail. A missing or other-user row is reported as NOT_FOUND. */
export async function getDocument(
  userId: string,
  documentId: string,
  deps: DocumentQueryDeps = defaultDeps(),
) {
  const row = await (deps.getRow ?? getRow)(userId, documentId);
  if (!row) throw new AppError("NOT_FOUND");

  const latest = await (deps.latestAnalysisRow ?? latestAnalysisRow)(
    userId,
    documentId,
  );
  const lifecycle = row.processing_status as DocumentLifecycle;

  return documentDetailResponseSchema.parse({
    documentId: row.id,
    title: row.title ?? row.original_filename,
    lifecycle,
    stage: lifecycleToStage(lifecycle),
    category: (row.category as DocumentCategory | null) ?? null,
    analysisStatus: latest ? statusToAnalysisStatus(latest.status) : "NONE",
    nextDeadline: null,
    needsAttention: ATTENTION_LIFECYCLES.has(lifecycle),
    createdAt: row.created_at,
    subtype: row.subtype,
    mimeType: row.mime_type as AllowedMimeType,
    fileSize: row.file_size,
    originalFilename: row.original_filename,
    updatedAt: row.updated_at,
    latestAnalysisId: latest?.id ?? null,
  });
}

type UpdateDocumentRequest = {
  title?: string;
  category?: DocumentCategory;
};

/** Data-access seam for updateDocument so unit tests run against fakes. */
export type UpdateDocumentDeps = {
  /** Current status and category, owner-only; a recipient gets null. */
  loadOwned: (
    userId: string,
    documentId: string,
  ) => Promise<{ processing_status: string; category: string | null } | null>;
  applyUpdate: (
    userId: string,
    documentId: string,
    patch: { title?: string; category?: DocumentCategory },
  ) => Promise<void>;
  reload: (
    userId: string,
    documentId: string,
  ) => Promise<z.infer<typeof documentDetailResponseSchema>>;
  enqueueReanalyze: (
    userId: string,
    documentId: string,
    category: DocumentCategory,
  ) => Promise<void>;
  kick: (origin: string) => void;
};

/**
 * Update the title and/or category. A category change on a COMPLETED document
 * enqueues a REANALYZE only when the new category's module set differs from the
 * old one, so a cosmetic re-pick does not re-run the whole analysis.
 */
export async function updateDocument(
  userId: string,
  documentId: string,
  request: UpdateDocumentRequest,
  origin: string,
  deps: UpdateDocumentDeps = defaultUpdateDeps(),
): Promise<z.infer<typeof documentDetailResponseSchema>> {
  const current = await deps.loadOwned(userId, documentId);
  if (!current) throw new AppError("NOT_FOUND");

  const patch: { title?: string; category?: DocumentCategory } = {};
  if (request.title !== undefined) patch.title = request.title;
  if (request.category !== undefined) patch.category = request.category;
  await deps.applyUpdate(userId, documentId, patch);

  // A category change on a finished document may require re-analysis.
  const categoryChanged =
    request.category !== undefined && request.category !== current.category;
  const shouldReanalyze =
    categoryChanged &&
    current.processing_status === "COMPLETED" &&
    categoryModulesDiffer(current.category, request.category!);

  if (shouldReanalyze) {
    await deps.enqueueReanalyze(userId, documentId, request.category!);
    deps.kick(origin);
  }

  return deps.reload(userId, documentId);
}

/**
 * Whether switching to newCategory would pull in a different module set. A null
 * old category (never classified) always counts as a difference.
 */
function categoryModulesDiffer(
  oldCategory: string | null,
  newCategory: DocumentCategory,
): boolean {
  if (oldCategory === null) return true;
  return modulesDiffer(oldCategory as DocumentCategory, newCategory);
}

/**
 * Analysis status for a document: the discriminated union READY | PROCESSING |
 * FAILED. A non-SUCCEEDED analysis row is NEVER returned as READY — only a
 * SUCCEEDED row with a parseable report yields READY. A stale queued job kicks
 * the runner so a stuck pipeline resumes.
 */
export async function getAnalysis(
  userId: string,
  documentId: string,
  language: ExplanationLanguage | undefined,
  deps: DocumentQueryDeps = defaultDeps(),
  origin?: string,
) {
  void language; // Translations arrive in a later task; the default is EN.
  const row = await (deps.getRow ?? getRow)(userId, documentId);
  if (!row) throw new AppError("NOT_FOUND");

  const lifecycle = row.processing_status as DocumentLifecycle;
  const latest = await (deps.latestAnalysisRow ?? latestAnalysisRow)(
    userId,
    documentId,
  );

  // READY only from a SUCCEEDED row with a valid report.
  if (latest && latest.status === "SUCCEEDED") {
    const analysis = parseAnalysisResult(latest.report_json, { documentId });
    return analysisResponseSchema.parse({
      state: "READY",
      analysisId: latest.id,
      version: latest.version ?? analysis.analysisMetadata.analysisVersion,
      analysis,
    });
  }

  if (lifecycle === "ANALYSIS_FAILED" || lifecycle === "OCR_FAILED") {
    return analysisResponseSchema.parse({
      state: "FAILED",
      errorCode: "INVALID_ANALYSIS",
      message: "Analysis did not complete.",
    });
  }

  // Still processing. A long-queued job means the pipeline may be stuck.
  if (origin) {
    const age = await (deps.oldestQueuedJobAge ?? oldestQueuedJobAge)(
      userId,
      documentId,
    );
    if (age !== null && age > STALE_JOB_MS) (deps.kick ?? kickJobRunner)(origin);
  }

  return analysisResponseSchema.parse({
    state: "PROCESSING",
    stage: lifecycleToStage(lifecycle),
  });
}

/** A specific analysis version by id. Only a SUCCEEDED version is returned. */
export async function getAnalysisById(
  userId: string,
  analysisId: string,
  deps: DocumentQueryDeps = defaultDeps(),
) {
  const row = await (deps.analysisById ?? analysisById)(userId, analysisId);
  if (!row || row.status !== "SUCCEEDED") throw new AppError("NOT_FOUND");

  const analysis = parseAnalysisResult(row.report_json, {
    documentId: row.document_id,
  });

  return analysisByIdResponseSchema.parse({
    analysisId: row.id,
    documentId: row.document_id,
    version: row.version,
    generatedAt: row.completed_at ?? analysis.analysisMetadata.generatedAt,
    analysis,
  });
}

/**
 * Page text and words for evidence navigation. RLS limits the rows to the
 * owner and share recipients, so a hidden page is reported as NOT_FOUND.
 */
export async function getPage(
  userId: string,
  documentId: string,
  pageNumber: number,
  deps: DocumentQueryDeps = defaultDeps(),
) {
  const row = await (deps.getPageRow ?? getPageRow)(
    userId,
    documentId,
    pageNumber,
  );
  if (!row) throw new AppError("NOT_FOUND");

  const words =
    (row.page_metadata as { words?: unknown[] } | null)?.words ?? [];

  return documentPageResponseSchema.parse({
    pageNumber: row.page_number,
    status: row.ocr_status as "READY" | "FAILED",
    text: row.extracted_text,
    words,
    averageConfidence: row.average_confidence,
  });
}

function statusToAnalysisStatus(status: string): AnalysisStatus {
  if (status === "SUCCEEDED") return "SUCCEEDED";
  if (status === "FAILED") return "FAILED";
  return "RUNNING";
}

/* -------------------------------------------------------------------------- */
/* Production data access. The user client enforces RLS so another user's     */
/* rows simply do not appear.                                                  */
/* -------------------------------------------------------------------------- */

async function listRows(userId: string): Promise<DocumentRow[]> {
  const { supabase } = await requireUser();
  const { data, error } = await supabase
    .from("documents")
    .select(
      "id, user_id, title, original_filename, processing_status, category, subtype, mime_type, file_size, created_at, updated_at",
    )
    .eq("user_id", userId);
  if (error) throw error;
  return (data ?? []) as DocumentRow[];
}

async function latestAnalysisStatus(
  _userId: string,
  documentId: string,
): Promise<AnalysisStatus> {
  const row = await latestAnalysisRow(_userId, documentId);
  return row ? statusToAnalysisStatus(row.status) : "NONE";
}

async function nextDeadline_(
  _userId: string,
  documentId: string,
): Promise<string | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("reminders")
    .select("due_at")
    .eq("document_id", documentId)
    .not("due_at", "is", null)
    .gte("due_at", new Date().toISOString())
    .order("due_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  return (data?.due_at as string | null) ?? null;
}

async function getRow(
  _userId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const { supabase } = await requireUser();
  // RLS limits the row to the owner and share recipients, so a hidden row
  // returns null and the service turns that into NOT_FOUND.
  const { data } = await supabase
    .from("documents")
    .select(
      "id, user_id, title, original_filename, processing_status, category, subtype, mime_type, file_size, created_at, updated_at",
    )
    .eq("id", documentId)
    .maybeSingle();
  return (data as DocumentRow | null) ?? null;
}

async function latestAnalysisRow(
  _userId: string,
  documentId: string,
): Promise<AnalysisRow | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("document_analyses")
    .select("id, status, version, report_json")
    .eq("document_id", documentId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as AnalysisRow | null) ?? null;
}

async function oldestQueuedJobAge(
  _userId: string,
  documentId: string,
): Promise<number | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("processing_jobs")
    .select("created_at")
    .eq("document_id", documentId)
    .in("status", ["queued", "RETRY_SCHEDULED", "processing"])
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  const createdAt = data?.created_at as string | undefined;
  return createdAt ? Date.now() - Date.parse(createdAt) : null;
}

async function analysisById(
  _userId: string,
  analysisId: string,
): Promise<{
  id: string;
  document_id: string;
  version: number;
  status: string;
  completed_at: string | null;
  report_json: unknown;
} | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("document_analyses")
    .select("id, document_id, version, status, completed_at, report_json")
    .eq("id", analysisId)
    .maybeSingle();
  return (data as {
    id: string;
    document_id: string;
    version: number;
    status: string;
    completed_at: string | null;
    report_json: unknown;
  } | null) ?? null;
}

async function getPageRow(
  _userId: string,
  documentId: string,
  pageNumber: number,
): Promise<PageRow | null> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("document_pages")
    .select("page_number, ocr_status, extracted_text, average_confidence, page_metadata")
    .eq("document_id", documentId)
    .eq("page_number", pageNumber)
    .maybeSingle();
  return (data as PageRow | null) ?? null;
}

/** All queries hit the user-scoped client, so RLS is the ownership boundary. */
function defaultDeps(): DocumentQueryDeps {
  return {};
}

function defaultUpdateDeps(): UpdateDocumentDeps {
  return {
    async loadOwned(userId, documentId) {
      const { supabase } = await requireUser();
      const { data } = await supabase
        .from("documents")
        .select("processing_status, category, user_id")
        .eq("id", documentId)
        .maybeSingle();
      // Only the owner may edit; a recipient gets NOT_FOUND.
      if (!data || data.user_id !== userId) return null;
      return {
        processing_status: data.processing_status as string,
        category: (data.category as string | null) ?? null,
      };
    },
    async applyUpdate(userId, documentId, patch) {
      if (patch.title === undefined && patch.category === undefined) return;
      const { supabase } = await requireUser();
      // RLS grants UPDATE only on (title, category) to the owner.
      const { error } = await supabase
        .from("documents")
        .update(patch)
        .eq("id", documentId);
      if (error) throw error;
    },
    reload: (userId, documentId) => getDocument(userId, documentId),
    async enqueueReanalyze(userId, documentId) {
      await enqueueJob({
        documentId,
        userId,
        type: "REANALYZE",
        idempotencyKey: `reanalyze:${documentId}:category`,
      });
    },
    kick: kickJobRunner,
  };
}
