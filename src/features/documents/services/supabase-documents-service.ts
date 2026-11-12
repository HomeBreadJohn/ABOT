import "server-only";

import { z } from "zod";

import { documentListItemSchema, reminderSchema } from "@/contracts";
import { requireUser } from "@/lib/auth/require-user";
import { AppError } from "@/lib/http/app-error";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

import {
  buildStoragePath,
  sanitizeStorageFilename,
  sniffMimeType,
  validateFileForUpload,
} from "../upload/upload-helpers";
import {
  INITIAL_SCHEMA_UPLOAD_POLICY,
  LIFECYCLE_UPLOAD_POLICY,
  type UploadPolicy,
  type AllowedMimeType,
} from "../upload/upload-policy";
import {
  discardUploadInputSchema,
  finalizeUploadInputSchema,
  prepareUploadInputSchema,
} from "../schemas/upload";
import {
  capabilitiesForProfile,
  mapAnalysisDeadlineSignals,
  mapDocumentRow,
  mapDocumentRows,
  mapReminderRows,
  deriveDocumentTitle,
} from "./supabase-row-mappers";
import {
  DocumentsServiceError,
  type DiscardUploadInput,
  type DocumentsSchemaProfile,
  type DocumentsService,
  type FinalizeUploadInput,
  type ListDocumentsResult,
  type PrepareUploadInput,
  type PreparedUpload,
} from "./documents-service";

const DOCUMENTS_BUCKET = "documents";
const MAX_DOCUMENTS = 200;
const SIGNED_UPLOAD_LIFETIME_MS = 115 * 60 * 1000;
const HEADER_SIGNED_URL_LIFETIME_SECONDS = 60;
const DOCUMENT_ID_SCHEMA = z.uuid();

type UserClient = Awaited<ReturnType<typeof createClient>>;
type DocumentSummary = z.infer<typeof documentListItemSchema>;
type Reminder = z.infer<typeof reminderSchema>;
type SupabaseRow = Readonly<Record<string, unknown>>;

type ValidatedUploadMetadata = {
  readonly originalFilename: string;
  readonly mimeType: AllowedMimeType;
  readonly fileSize: number;
};

const INITIAL_DOCUMENT_SELECT =
  "id, user_id, original_filename, storage_path, mime_type, file_size, processing_status, created_at, updated_at";
const LIFECYCLE_DOCUMENT_SELECT = `${INITIAL_DOCUMENT_SELECT}, title, category, subtype, document_analyses (id, document_id, version, status, report_json, completed_at, created_at)`;

function policyForProfile(profile: DocumentsSchemaProfile): UploadPolicy {
  return profile === "lifecycle"
    ? LIFECYCLE_UPLOAD_POLICY
    : INITIAL_SCHEMA_UPLOAD_POLICY;
}

function serviceError(
  code: ConstructorParameters<typeof DocumentsServiceError>[0],
  retryable: boolean,
): never {
  throw new DocumentsServiceError(code, retryable);
}

function mapAuthenticationError(error: unknown): never {
  if (error instanceof AppError && error.code === "UNAUTHENTICATED") {
    return serviceError("UNAUTHENTICATED", false);
  }

  return serviceError("UNAUTHENTICATED", false);
}

async function authenticatedContext(): Promise<{
  readonly supabase: UserClient;
  readonly userId: string;
}> {
  try {
    const { supabase, userId } = await requireUser();
    if (typeof userId !== "string" || userId.length === 0) {
      return mapAuthenticationError(new Error("Missing authenticated user"));
    }
    return { supabase, userId };
  } catch (error) {
    return mapAuthenticationError(error);
  }
}

function validateUploadMetadata(
  input: unknown,
  policy: UploadPolicy,
): ValidatedUploadMetadata {
  const parsed = prepareUploadInputSchema.safeParse(input);
  if (!parsed.success) return serviceError("INVALID_REQUEST", false);

  const validation = validateFileForUpload(
    {
      name: parsed.data.originalFilename,
      type: parsed.data.mimeType,
      size: parsed.data.fileSize,
    },
    policy,
  );

  if (!validation.ok) {
    if (validation.reason === "UNSUPPORTED_TYPE") {
      return serviceError("UNSUPPORTED_FILE", false);
    }
    return serviceError("INVALID_REQUEST", false);
  }

  return {
    originalFilename: validation.originalFilename,
    mimeType: validation.mimeType,
    fileSize: parsed.data.fileSize,
  };
}

function documentSelect(profile: DocumentsSchemaProfile): string {
  return profile === "lifecycle"
    ? LIFECYCLE_DOCUMENT_SELECT
    : INITIAL_DOCUMENT_SELECT;
}

function isRecord(value: unknown): value is SupabaseRow {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isUniqueViolation(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return error.code === "23505";
}

function isMissingObjectError(error: unknown): boolean {
  if (!isRecord(error)) return false;
  return (
    error.status === 404 ||
    error.statusCode === "404" ||
    error.code === "NoSuchKey"
  );
}

function documentRowData(value: unknown): SupabaseRow | null {
  return isRecord(value) ? value : null;
}

function mappedDocument(
  row: unknown,
  profile: DocumentsSchemaProfile,
): DocumentSummary {
  const mapped = mapDocumentRow(row, profile);
  if (!mapped) return serviceError("INTERNAL_ERROR", true);
  return mapped;
}

function throwDatabaseFailure(error: unknown): never {
  if (error) return serviceError("INTERNAL_ERROR", true);
  return serviceError("INTERNAL_ERROR", true);
}

async function removeAdminObject(
  adminClient: ReturnType<typeof createAdminClient>,
  path: string,
): Promise<void> {
  await adminClient.storage.from(DOCUMENTS_BUCKET).remove([path]);
}

async function readObjectHeader(
  adminClient: ReturnType<typeof createAdminClient>,
  path: string,
): Promise<Uint8Array> {
  const { data: signedUrl, error: signedUrlError } = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrl(path, HEADER_SIGNED_URL_LIFETIME_SECONDS);

  if (signedUrlError || !signedUrl?.signedUrl) {
    if (isMissingObjectError(signedUrlError)) {
      return serviceError("NOT_FOUND", true);
    }
    return serviceError("PROVIDER_UNAVAILABLE", true);
  }

  let response: Response;
  try {
    response = await fetch(signedUrl.signedUrl, {
      cache: "no-store",
      headers: { Range: "bytes=0-31" },
    });
  } catch {
    return serviceError("PROVIDER_UNAVAILABLE", true);
  }

  if (response.status === 404) return serviceError("NOT_FOUND", true);
  if (!response.ok) return serviceError("PROVIDER_UNAVAILABLE", true);

  try {
    const bytes = new Uint8Array(await response.arrayBuffer());
    return bytes.slice(0, 32);
  } catch {
    return serviceError("PROVIDER_UNAVAILABLE", true);
  }
}

async function getOwnedDocument(
  supabase: UserClient,
  userId: string,
  documentId: string,
  profile: DocumentsSchemaProfile,
): Promise<SupabaseRow | null> {
  const { data, error } = await supabase
    .from("documents")
    .select(documentSelect(profile))
    .eq("id", documentId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) return throwDatabaseFailure(error);
  return documentRowData(data);
}

async function getOwnedDocumentAfterConflict(
  supabase: UserClient,
  userId: string,
  documentId: string,
  profile: DocumentsSchemaProfile,
  path: string,
): Promise<DocumentSummary> {
  const existing = await getOwnedDocument(
    supabase,
    userId,
    documentId,
    profile,
  );
  if (!existing) return serviceError("CONFLICT", false);

  if (existing.storage_path !== path) {
    return serviceError("CONFLICT", false);
  }

  return mappedDocument(existing, profile);
}

async function validateUploadedObject(
  adminClient: ReturnType<typeof createAdminClient>,
  path: string,
  metadata: ValidatedUploadMetadata,
): Promise<void> {
  const { data: objectInfo, error: infoError } = await adminClient.storage
    .from(DOCUMENTS_BUCKET)
    .info(path);

  if (infoError || !objectInfo) {
    if (isMissingObjectError(infoError)) {
      return serviceError("NOT_FOUND", true);
    }
    return serviceError("PROVIDER_UNAVAILABLE", true);
  }

  const size = objectInfo.size;
  if (
    typeof size !== "number" ||
    !Number.isInteger(size) ||
    size <= 0 ||
    size > LIFECYCLE_UPLOAD_POLICY.maxFileBytes ||
    size !== metadata.fileSize
  ) {
    await removeAdminObject(adminClient, path);
    return serviceError("INVALID_REQUEST", false);
  }

  const header = await readObjectHeader(adminClient, path);
  if (sniffMimeType(header) !== metadata.mimeType) {
    await removeAdminObject(adminClient, path);
    return serviceError("UNSUPPORTED_FILE", false);
  }
}

function deadlineRowsForProfile(profile: DocumentsSchemaProfile): string {
  return profile === "lifecycle"
    ? `${LIFECYCLE_DOCUMENT_SELECT}`
    : INITIAL_DOCUMENT_SELECT;
}

export interface SupabaseDocumentsServiceOptions {
  readonly profile: DocumentsSchemaProfile;
}

export function createSupabaseDocumentsService(
  options: SupabaseDocumentsServiceOptions,
): DocumentsService {
  const { profile } = options;
  const uploadPolicy = policyForProfile(profile);
  const capabilities = capabilitiesForProfile(profile);

  return {
    source: "supabase",
    capabilities,

    getUploadPolicy(): UploadPolicy {
      return uploadPolicy;
    },

    async listDocuments(options): Promise<ListDocumentsResult> {
      const { supabase, userId } = await authenticatedContext();
      const requestedLimit = options?.limit;
      const limit = Math.min(
        MAX_DOCUMENTS,
        Math.max(
          0,
          typeof requestedLimit === "number" && Number.isInteger(requestedLimit)
            ? requestedLimit
            : MAX_DOCUMENTS,
        ),
      );

      const { data, error } = await supabase
        .from("documents")
        .select(documentSelect(profile))
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      if (error) return throwDatabaseFailure(error);
      return mapDocumentRows(data ?? [], profile);
    },

    async getDocument(documentId: string): Promise<DocumentSummary | null> {
      const { supabase, userId } = await authenticatedContext();
      if (!DOCUMENT_ID_SCHEMA.safeParse(documentId).success) return null;

      const row = await getOwnedDocument(
        supabase,
        userId,
        documentId,
        profile,
      );
      return row ? mappedDocument(row, profile) : null;
    },

    async listDeadlineSignals() {
      const { supabase, userId } = await authenticatedContext();
      if (!capabilities.deadlineCertainty) return [];

      const { data, error } = await supabase
        .from("documents")
        .select(deadlineRowsForProfile(profile))
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(MAX_DOCUMENTS);

      if (error) return throwDatabaseFailure(error);

      return (data ?? []).flatMap((row: unknown) => {
        const mapped = mapDocumentRow(row, profile);
        if (!mapped || !isRecord(row)) return [];
        const analysis = row.document_analyses;
        return mapAnalysisDeadlineSignals(
          mapped.documentId,
          analysis,
          mapped.lifecycle === "NEEDS_CORRECTION",
        );
      });
    },

    async listReminders(): Promise<readonly Reminder[]> {
      const { supabase, userId } = await authenticatedContext();
      if (!capabilities.reminders) return [];

      const { data, error } = await supabase
        .from("reminders")
        .select("id, document_id, title, due_at, status, description")
        .eq("user_id", userId)
        .eq("status", "PENDING")
        .order("due_at", { ascending: true });

      if (error) return throwDatabaseFailure(error);
      return mapReminderRows(data ?? [], profile);
    },

    async prepareUpload(input: PrepareUploadInput): Promise<PreparedUpload> {
      const { supabase, userId } = await authenticatedContext();
      const metadata = validateUploadMetadata(input, uploadPolicy);
      const documentId = crypto.randomUUID();
      const safeName = sanitizeStorageFilename(
        metadata.originalFilename,
        metadata.mimeType,
      );
      const path = buildStoragePath(userId, documentId, safeName);

      const { data, error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUploadUrl(path, { upsert: false });

      if (error || !data?.signedUrl) {
        return serviceError("PROVIDER_UNAVAILABLE", true);
      }

      return {
        transport: "signed-url",
        documentId,
        signedUrl: data.signedUrl,
        expiresAt: Date.now() + SIGNED_UPLOAD_LIFETIME_MS,
      };
    },

    async finalizeUpload(
      input: FinalizeUploadInput,
    ): Promise<DocumentSummary> {
      const { supabase, userId } = await authenticatedContext();
      const parsed = finalizeUploadInputSchema.safeParse(input);
      if (!parsed.success) return serviceError("INVALID_REQUEST", false);

      const metadata = validateUploadMetadata(parsed.data, uploadPolicy);
      const safeName = sanitizeStorageFilename(
        metadata.originalFilename,
        metadata.mimeType,
      );
      const path = buildStoragePath(userId, parsed.data.documentId, safeName);

      const existing = await getOwnedDocument(
        supabase,
        userId,
        parsed.data.documentId,
        profile,
      );
      if (existing) {
        if (existing.storage_path !== path) {
          return serviceError("CONFLICT", false);
        }
        return mappedDocument(existing, profile);
      }

      const adminClient = createAdminClient();
      await validateUploadedObject(adminClient, path, metadata);

      const processingStatus = profile === "lifecycle" ? "UPLOADED" : "pending";
      const insertPayload = {
        id: parsed.data.documentId,
        user_id: userId,
        original_filename: metadata.originalFilename,
        storage_path: path,
        mime_type: metadata.mimeType,
        file_size: metadata.fileSize,
        processing_status: processingStatus,
        ...(profile === "lifecycle"
          ? { title: deriveDocumentTitle(metadata.originalFilename) }
          : {}),
      };

      const { data, error } = await supabase
        .from("documents")
        .insert(insertPayload)
        .select(documentSelect(profile))
        .single();

      if (error) {
        if (isUniqueViolation(error)) {
          return getOwnedDocumentAfterConflict(
            supabase,
            userId,
            parsed.data.documentId,
            profile,
            path,
          );
        }

        await removeAdminObject(adminClient, path);
        return serviceError("INTERNAL_ERROR", true);
      }

      return mappedDocument(data, profile);
    },

    async discardUpload(input: DiscardUploadInput): Promise<void> {
      const { supabase, userId } = await authenticatedContext();
      const parsed = discardUploadInputSchema.safeParse(input);
      if (!parsed.success) return serviceError("INVALID_REQUEST", false);

      const metadata = validateUploadMetadata(parsed.data, uploadPolicy);
      const path = buildStoragePath(
        userId,
        parsed.data.documentId,
        sanitizeStorageFilename(metadata.originalFilename, metadata.mimeType),
      );

      const existing = await getOwnedDocument(
        supabase,
        userId,
        parsed.data.documentId,
        profile,
      );
      if (existing) return;

      const { error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .remove([path]);
      if (error && !isMissingObjectError(error)) {
        return serviceError("PROVIDER_UNAVAILABLE", true);
      }
    },
  };
}
