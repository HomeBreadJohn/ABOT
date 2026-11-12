import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { apiErrorSchema } from "@/contracts";
import { AppError } from "@/lib/http/app-error";
import { withApiErrors } from "@/lib/http/api-response";

describe("withApiErrors", () => {
  it("maps a thrown AppError to its status and a contract-valid body", async () => {
    const handler = withApiErrors(() => {
      throw new AppError("NOT_FOUND", "Document not found");
    });

    const response = await handler();

    expect(response.status).toBe(404);
    const body = apiErrorSchema.parse(await response.json());
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("Document not found");
    expect(body.error.requestId).toBeTruthy();
  });

  it("maps a ZodError to INVALID_REQUEST 400 with issue paths and no raw values", async () => {
    const schema = z.object({ name: z.string() });
    const handler = withApiErrors(async (request: Request) => {
      schema.parse(await request.json());
      return Response.json({ ok: true });
    });

    const response = await handler(
      new Request("https://example.test/api/x", {
        method: "POST",
        body: JSON.stringify({ name: 123, secret: "hunter2" }),
      }),
    );

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe("INVALID_REQUEST");
    expect(body.error.issues).toEqual([
      { path: ["name"], message: expect.any(String) },
    ]);
    const text = JSON.stringify(body);
    expect(text).not.toContain("hunter2");
    expect(text).not.toContain("123");
  });

  it("maps an unknown thrown error to INTERNAL_ERROR 500 with a generic message", async () => {
    const handler = withApiErrors(() => {
      throw new Error("db password is s3cret at 10.0.0.4");
    });

    const response = await handler();

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(apiErrorSchema.safeParse(body).success).toBe(true);
    expect(body.error.code).toBe("INTERNAL_ERROR");
    const text = JSON.stringify(body);
    expect(text).not.toContain("s3cret");
    expect(text).not.toContain("10.0.0.4");
  });

  it("logs exactly one allowlisted entry for an unknown error, sharing the client's requestId, with no original text", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const handler = withApiErrors(() => {
        throw new Error("db password is s3cret at 10.0.0.4");
      });

      const response = await handler();
      const body = await response.json();

      expect(errorSpy).toHaveBeenCalledTimes(1);
      const [message, fields] = errorSpy.mock.calls[0] as [
        string,
        Record<string, unknown>,
      ];
      expect(message).toBe("unhandled route error");
      expect(Object.keys(fields).sort()).toEqual([
        "errorCode",
        "requestId",
      ]);
      expect(fields.errorCode).toBe("INTERNAL_ERROR");
      expect(fields.requestId).toBe(body.error.requestId);
      expect(JSON.stringify([message, fields])).not.toContain("s3cret");
    } finally {
      errorSpy.mockRestore();
    }
  });
});
