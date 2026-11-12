import { describe, expect, it } from "vitest";
import { mockUtilityBillAnalysis } from "@/contracts";

describe("smoke", () => {
  it("loads the mock fixture with a string schemaVersion", () => {
    expect(typeof mockUtilityBillAnalysis.schemaVersion).toBe("string");
  });
});
