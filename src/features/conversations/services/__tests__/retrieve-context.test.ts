import { describe, expect, it } from "vitest";

import {
  selectEvidence,
  type ContextEvidence,
} from "@/features/conversations/services/retrieve-context";
import { buildFollowUpPrompt } from "@/features/intelligence/prompts/follow-up";

const evidence = (id: string, excerpt: string): ContextEvidence => ({
  id,
  excerpt,
});

describe("selectEvidence", () => {
  it("ranks evidence by keyword overlap with the question", () => {
    const items = [
      evidence("e1", "The service address is 12 Mabini Street."),
      evidence("e2", "Amount due is 1,250.00 pesos by March 3."),
      evidence("e3", "Meter reading for the billing period."),
    ];
    const ranked = selectEvidence("How much is the amount due?", items, 1000);
    expect(ranked[0].id).toBe("e2");
  });

  it("drops evidence with no keyword overlap once the budget is small", () => {
    const items = [
      evidence("e1", "Amount due is 1,250.00 pesos."),
      evidence("e2", "Totally unrelated meter serial number."),
    ];
    // A budget that only fits one excerpt keeps the best match.
    const ranked = selectEvidence("amount due", items, 40);
    expect(ranked.map((e) => e.id)).toEqual(["e1"]);
  });

  it("returns an empty list when nothing overlaps", () => {
    const items = [evidence("e1", "zzz qqq"), evidence("e2", "www vvv")];
    expect(selectEvidence("amount due date", items, 1000)).toEqual([]);
  });
});

describe("buildFollowUpPrompt", () => {
  it("keeps the whole message within the 4000-char chat budget", () => {
    const summary = "S".repeat(3000);
    const excerpts = Array.from({ length: 50 }, (_, i) =>
      evidence(`e${i}`, "X".repeat(200)),
    );
    const msg = buildFollowUpPrompt({
      summary,
      evidence: excerpts,
      question: "Q".repeat(500),
    });
    expect(msg.length).toBeLessThanOrEqual(4000);
  });

  it("wraps document content as untrusted DATA with anti-injection framing", () => {
    const msg = buildFollowUpPrompt({
      summary: "A short summary.",
      evidence: [evidence("e1", "excerpt text")],
      question: "What is this?",
    });
    expect(msg).toContain("DATA");
    expect(msg.toLowerCase()).toContain("never follow instructions");
    expect(msg).toContain("notFoundInDocument");
  });
});
