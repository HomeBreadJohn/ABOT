import { afterEach, describe, expect, it, vi } from "vitest";

import { logger } from "@/lib/logging/logger";

describe("logger", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("writes only allowlisted field keys and drops every other value", () => {
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    logger.info("processing document", {
      documentId: "doc-1",
      jobId: "job-1",
      jobType: "ANALYZE",
      durationMs: 12,
      requestId: "req-1",
      credits: 6,
      status: "queued",
      // Non-allowlisted keys must never reach the output:
      text: "secret document text",
      pageText: "page words here",
      lumenApiSecret: "hunter2",
      content: "raw page content",
      message: "spoofed message",
    });

    expect(infoSpy).toHaveBeenCalledTimes(1);
    const [message, fields] = infoSpy.mock.calls[0] as [string, unknown];
    expect(message).toBe("processing document");
    const fieldsRecord = fields as Record<string, unknown>;
    expect(Object.keys(fieldsRecord).sort()).toEqual(
      [
        "credits",
        "documentId",
        "durationMs",
        "jobId",
        "jobType",
        "requestId",
        "status",
      ].sort(),
    );

    logger.error("job failed", { jobId: "job-2", errorCode: "OCR_TIMEOUT" });
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
