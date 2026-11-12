"use client";

export const UPLOAD_TIMEOUT_MS = 120_000;

export type XhrUploadFailureReason = "network" | "http" | "aborted";

export type XhrUploadResult =
  | { readonly ok: true }
  | {
      readonly ok: false;
      readonly status: number | null;
      readonly reason: XhrUploadFailureReason;
    };

/**
 * Uploads browser bytes directly to a prepared Storage URL.
 *
 * The URL stays in memory. This function does not navigate, mutate browser
 * history, or log the URL. XHR is used because fetch does not expose upload
 * progress events.
 */
export function putWithProgress(
  url: string,
  file: File,
  onProgress: (loaded: number, total: number | null) => void,
  signal: AbortSignal,
): Promise<XhrUploadResult> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    let settled = false;

    const finish = (result: XhrUploadResult) => {
      if (settled) {
        return;
      }

      settled = true;
      signal.removeEventListener("abort", abortRequest);
      resolve(result);
    };

    const abortRequest = () => {
      xhr.abort();
    };

    if (signal.aborted) {
      finish({ ok: false, status: null, reason: "aborted" });
      return;
    }

    try {
      xhr.open("PUT", url, true);
      xhr.timeout = UPLOAD_TIMEOUT_MS;
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader(
        "content-type",
        file.type || "application/octet-stream",
      );
    } catch {
      finish({ ok: false, status: null, reason: "network" });
      return;
    }

    xhr.upload.addEventListener("progress", (event) => {
      if (!event.lengthComputable || event.total <= 0) {
        onProgress(event.loaded, null);
        return;
      }

      onProgress(event.loaded, event.total);
    });

    xhr.addEventListener("load", () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        finish({ ok: true });
        return;
      }

      finish({ ok: false, status: xhr.status || null, reason: "http" });
    });
    xhr.addEventListener("error", () => {
      finish({ ok: false, status: xhr.status || null, reason: "network" });
    });
    xhr.addEventListener("timeout", () => {
      finish({ ok: false, status: xhr.status || null, reason: "network" });
    });
    xhr.addEventListener("abort", () => {
      finish({ ok: false, status: xhr.status || null, reason: "aborted" });
    });

    signal.addEventListener("abort", abortRequest, { once: true });
    try {
      xhr.send(file);
    } catch {
      finish({ ok: false, status: null, reason: "network" });
    }
  });
}
