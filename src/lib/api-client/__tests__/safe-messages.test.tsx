import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { apiErrorCodeSchema } from "@/contracts";
import { ApiClientError } from "@/lib/api-client/client";
import {
  SAFE_API_MESSAGES,
  safeCodeFor,
  safeMessageFor,
} from "@/lib/api-client/safe-messages";
import { useApiError } from "@/lib/api-client/use-api-error";

describe("safe API messages", () => {
  it("has non-empty fixed copy for every API error code", () => {
    for (const code of apiErrorCodeSchema.options) {
      expect(SAFE_API_MESSAGES[code].length).toBeGreaterThan(0);
    }
    expect(Object.keys(SAFE_API_MESSAGES).sort()).toEqual(
      [...apiErrorCodeSchema.options].sort(),
    );
  });

  it("uses the code's fixed copy and never the raw error message", () => {
    for (const code of apiErrorCodeSchema.options) {
      const raw = `RAW-DB-ERROR duplicate key ${code}`;
      const message = safeMessageFor(new ApiClientError(code, raw, 400));
      expect(message).toBe(SAFE_API_MESSAGES[code]);
      expect(message).not.toContain("RAW-DB-ERROR");
    }
  });

  it("maps unknown and non-ApiClientError values to the INTERNAL_ERROR copy", () => {
    const internal = SAFE_API_MESSAGES.INTERNAL_ERROR;
    expect(safeMessageFor(new Error("secret stack detail"))).toBe(internal);
    expect(safeMessageFor("a string")).toBe(internal);
    expect(safeMessageFor(null)).toBe(internal);
    expect(safeMessageFor(undefined)).toBe(internal);
    expect(safeMessageFor({ code: "NOT_FOUND", message: "plain object" })).toBe(
      internal,
    );
    expect(safeCodeFor(new Error("x"))).toBe("INTERNAL_ERROR");
  });

  it("does not interpolate runtime text into any message", () => {
    for (const message of Object.values(SAFE_API_MESSAGES)) {
      expect(message).not.toMatch(/[{}$]|undefined|null|\[object/);
    }
  });
});

describe("useApiError", () => {
  it("starts with no message and no code", () => {
    function Probe() {
      const error = useApiError();
      return (
        <p data-code={String(error.code)} data-message={String(error.message)}>
          {typeof error.set}-{typeof error.clear}
        </p>
      );
    }

    const html = renderToStaticMarkup(<Probe />);
    expect(html).toContain('data-code="null"');
    expect(html).toContain('data-message="null"');
    expect(html).toContain("function-function");
  });
});
