import { describe, expect, it } from "vitest";
import { reconcileStatus } from "@/server/status";

describe("semantic status reconciliation", () => {
  it("gives blockers attention priority over current busy state", () => {
    expect(
      reconcileStatus(
        "working",
        [{ verb: "blocked", summary: "captain action required" }],
        "working",
      ),
    ).toMatchObject({ status: "blocked", blocker: "captain action required" });
  });

  it("keeps decisions distinct from blockers and review", () => {
    expect(
      reconcileStatus(
        "parked",
        [{ verb: "needs-decision", summary: "choose A or B" }],
        "review",
      ),
    ).toMatchObject({ status: "needs-decision", decision: "choose A or B" });
    expect(reconcileStatus("working", [], "review").status).toBe("review");
  });

  it("defaults malformed and new states to unknown", () => {
    expect(reconcileStatus({ state: "working" }, "bad").status).toBe("unknown");
  });
});
