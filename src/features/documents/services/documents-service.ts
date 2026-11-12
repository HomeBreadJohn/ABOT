import type { z } from "zod";

import {
  documentListItemSchema,
  reminderSchema,
  type ApiErrorCode,
  type InformationStatus,
} from "@/contracts";
import type {
  AllowedMimeType,
  UploadPolicy,
} from "@/features/documents/upload/upload-policy";

type DocumentSummary = z.infer<typeof documentListItemSchema>;
type Reminder = z.infer<typeof reminderSchema>;

export type DocumentsDataSource = "mock" | "supabase";
export type DocumentsSchemaProfile = "initial" | "lifecycle";

/** Fixed, user-safe messages for every code in the shared API error contract. */
export const DOCUMENTS_ERROR_MESSAGES: Readonly<Record<ApiErrorCode, string>> =
  {
    UNAUTHENTICATED: "Please sign in again to continue.",
    FORBIDDEN: "You don't have access to this document.",
    NOT_FOUND: "We couldn't find that document.",
    INVALID_REQUEST: "We couldn't validate that request.",
    CONFLICT: "This upload is already being handled. Please try again.",
    NOT_READY: "This document isn't ready yet. Please try again later.",
    UNSUPPORTED_FILE:
      "We can't read this kind of file yet. Please choose a supported file.",
    RATE_LIMITED: "Too many requests. Please try again later.",
    PROVIDER_UNAVAILABLE:
      "The document service is temporarily unavailable. Please try again.",
    INVALID_ANALYSIS: "We couldn't validate the document analysis.",
    INTERNAL_ERROR: "We couldn't complete that request. Please try again.",
  };

export interface DocumentsServiceCapabilities {
  /** False under the initial schema because it has no reminders table. */
  readonly reminders: boolean;
  /** True when deadline signals carry an InformationStatus. */
  readonly deadlineCertainty: boolean;
}

/** A deadline extracted from a completed analysis report. */
export interface DeadlineSignal {
  readonly documentId: string;
  /** Stable importantDates[].id from the source analysis. */
  readonly sourceItemId: string;
  readonly title: string;
  /** A yyyy-mm-dd calendar date, or null when the source is unclear. */
  readonly date: string | null;
  readonly informationStatus: InformationStatus;
  /** True when the document status is NEEDS_CORRECTION. */
  readonly provisional: boolean;
}

export interface ListDocumentsResult {
  readonly documents: readonly DocumentSummary[];
  /** Rows that failed validation and were not shown. */
  readonly skippedCount: number;
}

export interface PrepareUploadInput {
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSize: number;
}

export type PreparedUpload =
  | {
      readonly transport: "signed-url";
      readonly documentId: string;
      readonly signedUrl: string;
      /** Signed upload URLs are used for at most 115 minutes. */
      readonly expiresAt: number;
    }
  | { readonly transport: "mock"; readonly documentId: string };

export interface FinalizeUploadInput {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
  readonly fileSize: number;
}

export interface DiscardUploadInput {
  readonly documentId: string;
  readonly originalFilename: string;
  readonly mimeType: string;
}

export interface DocumentsService {
  readonly source: DocumentsDataSource;
  readonly capabilities: DocumentsServiceCapabilities;
  getUploadPolicy(): UploadPolicy;
  /** Owned documents only, newest first, at most 200 rows. */
  listDocuments(options?: { limit?: number }): Promise<ListDocumentsResult>;
  /** Null when the id is invalid, missing, or not visible to the user. */
  getDocument(documentId: string): Promise<DocumentSummary | null>;
  /** DEADLINE important dates from each document's latest completed analysis. */
  listDeadlineSignals(): Promise<readonly DeadlineSignal[]>;
  /** PENDING reminders, or an empty list when reminders are unavailable. */
  listReminders(): Promise<readonly Reminder[]>;
  prepareUpload(input: PrepareUploadInput): Promise<PreparedUpload>;
  /** Idempotent for the same document id and authenticated user. */
  finalizeUpload(input: FinalizeUploadInput): Promise<DocumentSummary>;
  /** Removes an uploaded-but-unregistered object; otherwise a no-op. */
  discardUpload(input: DiscardUploadInput): Promise<void>;
}

export class DocumentsServiceError extends Error {
  readonly code: ApiErrorCode;
  readonly retryable: boolean;

  constructor(code: ApiErrorCode, retryable: boolean) {
    super(DOCUMENTS_ERROR_MESSAGES[code]);
    this.name = "DocumentsServiceError";
    this.code = code;
    this.retryable = retryable;
    Object.setPrototypeOf(this, DocumentsServiceError.prototype);
  }
}

export type { AllowedMimeType, UploadPolicy };
