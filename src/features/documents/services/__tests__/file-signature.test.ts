import { describe, expect, it } from "vitest";

import { detectMimeType } from "@/features/documents/services/file-signature";

function bytes(...values: number[]): Uint8Array {
  return Uint8Array.from(values);
}

describe("detectMimeType", () => {
  it("recognizes a PDF header", () => {
    // "%PDF-"
    expect(detectMimeType(bytes(0x25, 0x50, 0x44, 0x46, 0x2d))).toBe(
      "application/pdf",
    );
  });

  it("recognizes a JPEG header", () => {
    expect(detectMimeType(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("image/jpeg");
  });

  it("recognizes a PNG header", () => {
    expect(
      detectMimeType(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)),
    ).toBe("image/png");
  });

  it("recognizes little-endian TIFF", () => {
    expect(detectMimeType(bytes(0x49, 0x49, 0x2a, 0x00))).toBe("image/tiff");
  });

  it("recognizes big-endian TIFF", () => {
    expect(detectMimeType(bytes(0x4d, 0x4d, 0x00, 0x2a))).toBe("image/tiff");
  });

  it("recognizes WebP (RIFF....WEBP)", () => {
    // "RIFF" + 4 size bytes + "WEBP"
    expect(
      detectMimeType(
        bytes(
          0x52,
          0x49,
          0x46,
          0x46,
          0x24,
          0x00,
          0x00,
          0x00,
          0x57,
          0x45,
          0x42,
          0x50,
        ),
      ),
    ).toBe("image/webp");
  });

  it("returns null for an MZ executable header", () => {
    expect(detectMimeType(bytes(0x4d, 0x5a, 0x90, 0x00))).toBeNull();
  });

  it("returns null for unknown bytes", () => {
    expect(detectMimeType(bytes(0x00, 0x01, 0x02, 0x03))).toBeNull();
  });

  it("returns null when a RIFF container is not WEBP", () => {
    // RIFF + size + "WAVE"
    expect(
      detectMimeType(
        bytes(
          0x52,
          0x49,
          0x46,
          0x46,
          0x24,
          0x00,
          0x00,
          0x00,
          0x57,
          0x41,
          0x56,
          0x45,
        ),
      ),
    ).toBeNull();
  });
});
