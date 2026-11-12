import type { AllowedMimeType } from "@/contracts";

/**
 * Identify a file by its leading bytes (magic number), not its claimed MIME
 * type. A renamed PNG or an executable is caught here regardless of the client
 * mimeType. Returns null for anything not in the allowed set.
 */
export function detectMimeType(
  firstBytes: Uint8Array,
): AllowedMimeType | null {
  const b = firstBytes;

  // "%PDF-"
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf";
  // JPEG: FF D8 FF
  if (startsWith(b, [0xff, 0xd8, 0xff])) return "image/jpeg";
  // PNG: 89 50 4E 47
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47])) return "image/png";
  // TIFF little-endian / big-endian
  if (startsWith(b, [0x49, 0x49, 0x2a, 0x00])) return "image/tiff";
  if (startsWith(b, [0x4d, 0x4d, 0x00, 0x2a])) return "image/tiff";
  // WebP: "RIFF" .... "WEBP" (bytes 0-3 and 8-11)
  if (
    startsWith(b, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(b.subarray(8), [0x57, 0x45, 0x42, 0x50])
  )
    return "image/webp";

  return null;
}

function startsWith(bytes: Uint8Array, prefix: number[]): boolean {
  if (bytes.length < prefix.length) return false;
  for (let i = 0; i < prefix.length; i++) {
    if (bytes[i] !== prefix[i]) return false;
  }
  return true;
}
