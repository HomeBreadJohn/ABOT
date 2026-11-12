import type { AllowedMimeType } from "@/contracts/common";

import type { UploadPolicy } from "./upload-policy";

const EXTENSION_MIME: Record<string, AllowedMimeType> = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  tif: "image/tiff",
  tiff: "image/tiff",
  webp: "image/webp",
};

const MIME_EXTENSION: Record<AllowedMimeType, string> = {
  "application/pdf": "pdf",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/tiff": "tiff",
  "image/webp": "webp",
};

const MAX_ORIGINAL_FILENAME_LENGTH = 255;

export interface FileDescriptor {
  readonly name: string;
  /** Browser-reported and therefore untrusted. */
  readonly type: string;
  readonly size: number;
}

export type FileRejectionReason =
  | "UNSUPPORTED_TYPE"
  | "EMPTY_FILE"
  | "FILE_TOO_LARGE"
  | "DUPLICATE"
  | "TOO_MANY_FILES"
  | "CONTENT_MISMATCH";

export type FileValidationResult =
  | {
      readonly ok: true;
      readonly mimeType: AllowedMimeType;
      readonly originalFilename: string;
    }
  | { readonly ok: false; readonly reason: FileRejectionReason };

/**
 * Resolves a browser-declared MIME type, falling back to the file extension
 * when the browser has no useful declaration.
 */
export function resolveMimeType(
  file: Pick<FileDescriptor, "name" | "type">,
): string {
  const declared = file.type.trim().toLowerCase();

  if (declared && declared !== "application/octet-stream") {
    return declared === "image/jpg" ? "image/jpeg" : declared;
  }

  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return EXTENSION_MIME[extension] ?? declared;
}

/**
 * Applies the active profile's allow-list and size limit in the documented
 * order. This function does not inspect bytes; callers use sniffMimeType for
 * the authoritative content check.
 */
export function validateFileForUpload(
  file: FileDescriptor,
  policy: UploadPolicy,
): FileValidationResult {
  const mimeType = resolveMimeType(file);

  if (!policy.allowedMimeTypes.includes(mimeType as AllowedMimeType)) {
    return { ok: false, reason: "UNSUPPORTED_TYPE" };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, reason: "EMPTY_FILE" };
  }

  if (file.size > policy.maxFileBytes) {
    return { ok: false, reason: "FILE_TOO_LARGE" };
  }

  return {
    ok: true,
    mimeType: mimeType as AllowedMimeType,
    originalFilename: normalizeOriginalFilename(file.name),
  };
}

/**
 * Identifies the supported file format from its leading magic bytes.
 * This is a format check, not a malware scan.
 */
export function sniffMimeType(bytes: Uint8Array): AllowedMimeType | null {
  const starts = (signature: readonly number[], offset = 0): boolean =>
    signature.every((byte, index) => bytes[offset + index] === byte);

  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) {
    return "application/pdf";
  }

  if (starts([0xff, 0xd8, 0xff])) {
    return "image/jpeg";
  }

  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return "image/png";
  }

  if (
    starts([0x49, 0x49, 0x2a, 0x00]) ||
    starts([0x4d, 0x4d, 0x00, 0x2a])
  ) {
    return "image/tiff";
  }

  if (
    starts([0x52, 0x49, 0x46, 0x46]) &&
    starts([0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return "image/webp";
  }

  return null;
}

/**
 * Creates a deterministic storage basename. The original filename is kept
 * separately as metadata; only this basename is normalized for a storage key.
 */
export function sanitizeStorageFilename(
  original: string,
  mimeType: AllowedMimeType,
): string {
  const base = original
    .replace(/\.[^.]*$/, "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/g, "");

  return `${base || "document"}.${MIME_EXTENSION[mimeType]}`;
}

/**
 * Builds the owner-scoped storage key from values established by the server.
 */
export function buildStoragePath(
  ownerId: string,
  documentId: string,
  safeName: string,
): string {
  return `${ownerId}/${documentId}/${safeName}`;
}

function normalizeOriginalFilename(original: string): string {
  const cleaned = original.replace(/[\u0000-\u001f\u007f]/g, "").trim();

  if (!cleaned) {
    return "document";
  }

  if (cleaned.length <= MAX_ORIGINAL_FILENAME_LENGTH) {
    return cleaned;
  }

  const extensionMatch = cleaned.match(/(\.[^./\\]*)$/);
  if (!extensionMatch) {
    return cleaned.slice(0, MAX_ORIGINAL_FILENAME_LENGTH);
  }

  const extension = extensionMatch[1];
  const base = cleaned.slice(0, -extension.length);
  const maxBaseLength = MAX_ORIGINAL_FILENAME_LENGTH - extension.length;

  if (maxBaseLength <= 0) {
    return cleaned.slice(0, MAX_ORIGINAL_FILENAME_LENGTH);
  }

  return `${base.slice(0, maxBaseLength)}${extension}`;
}
