/**
 * Shared upload policy values used by browser and server modules.
 *
 * This module intentionally has no server-only or React dependencies. The
 * active profile chooses which subset is accepted; the size and batch limits
 * are shared by every profile.
 */
import {
  allowedMimeTypeSchema,
  MAX_DOCUMENT_SIZE_BYTES,
} from "@/contracts/common";
import type { AllowedMimeType } from "@/contracts/common";

/** The complete product allow-list from the shared contract. */
export const PRODUCT_MIME_TYPES = allowedMimeTypeSchema.options;
export type { AllowedMimeType } from "@/contracts/common";

export { MAX_DOCUMENT_SIZE_BYTES };
export const MAX_FILES_PER_BATCH = 10;

interface MimeTypeDetails {
  readonly label: string;
  readonly extensions: readonly string[];
}

const MIME_TYPE_DETAILS: Record<AllowedMimeType, MimeTypeDetails> = {
  "application/pdf": { label: "PDF", extensions: [".pdf"] },
  "image/jpeg": { label: "JPEG", extensions: [".jpg", ".jpeg"] },
  "image/png": { label: "PNG", extensions: [".png"] },
  "image/tiff": { label: "TIFF", extensions: [".tif", ".tiff"] },
  "image/webp": { label: "WebP", extensions: [".webp"] },
};

export interface UploadPolicy {
  readonly allowedMimeTypes: readonly AllowedMimeType[];
  readonly maxFileBytes: number;
  readonly maxFilesPerBatch: number;
  /** Value for a general file input's `accept` attribute. */
  readonly acceptAttribute: string;
  /** Image MIME types and extensions for the gallery input. */
  readonly imageAcceptAttribute: string;
  /** User-facing list of accepted formats. */
  readonly formatsLabel: string;
  /** User-facing size label. The enforced value is 10 MiB. */
  readonly maxSizeLabel: string;
}

function formatList(values: readonly string[]): string {
  if (values.length <= 1) {
    return values[0] ?? "";
  }

  if (values.length === 2) {
    return `${values[0]} or ${values[1]}`;
  }

  return `${values.slice(0, -1).join(", ")}, or ${values.at(-1)}`;
}

function acceptTokens(mimeTypes: readonly AllowedMimeType[]): string[] {
  return mimeTypes.flatMap((mimeType) => [
    mimeType,
    ...MIME_TYPE_DETAILS[mimeType].extensions,
  ]);
}

/**
 * Creates a serializable policy for a deployment's schema profile.
 *
 * The input is copied so callers cannot mutate a policy after it has been
 * created. MIME types are validated at runtime as this function may receive
 * configuration-derived values at a trust boundary.
 */
export function createUploadPolicy(
  allowed: readonly AllowedMimeType[],
): UploadPolicy {
  const allowedMimeTypes = [...allowed];
  const seen = new Set<AllowedMimeType>();

  for (const mimeType of allowedMimeTypes) {
    if (!(mimeType in MIME_TYPE_DETAILS) || seen.has(mimeType)) {
      throw new Error("Upload policy contains an invalid or duplicate MIME type");
    }
    seen.add(mimeType);
  }

  const allAcceptTokens = acceptTokens(allowedMimeTypes);
  const imageMimeTypes = allowedMimeTypes.filter((mimeType) =>
    mimeType.startsWith("image/"),
  );

  return {
    allowedMimeTypes,
    maxFileBytes: MAX_DOCUMENT_SIZE_BYTES,
    maxFilesPerBatch: MAX_FILES_PER_BATCH,
    acceptAttribute: allAcceptTokens.join(","),
    imageAcceptAttribute: acceptTokens(imageMimeTypes).join(","),
    formatsLabel: formatList(
      allowedMimeTypes.map((mimeType) => MIME_TYPE_DETAILS[mimeType].label),
    ),
    maxSizeLabel: "10 MB",
  };
}

export const LIFECYCLE_UPLOAD_POLICY = createUploadPolicy(PRODUCT_MIME_TYPES);

export const INITIAL_SCHEMA_UPLOAD_POLICY = createUploadPolicy([
  "application/pdf",
  "image/jpeg",
  "image/png",
]);
