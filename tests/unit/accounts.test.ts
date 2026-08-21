import { describe, expect, it } from "vitest";
import { comparableWindows } from "@/server/accounts";
import type { AccountView, QuotaWindow } from "@/server/contracts";

function window(id: string, percentage: number): QuotaWindow {
  return {
    id,
    label: id,
    kind: "weekly",
    percentRemaining: percentage,
    resetsAt: 1,
    windowSeconds: 2,
    elapsedPercent: 3,
    pace: {
      status: "unknown",
      burnMultiple: null,
      projectedExhaustedAt: null,
      projectionConfidence: null,
    },
  };
}
function account(alias: string, windows: QuotaWindow[]): AccountView {
  return {
    alias,
    sourceId: `claude:oauth-profile:····${alias === "a" ? "a4f2" : "c81d"}`,
    provider: "claude",
    plan: null,
    state: { status: "fresh", refreshedAt: 1 },
    windows,
    note: null,
  };
}

describe("multi-account comparability", () => {
  it("labels the best account per genuinely comparable window without summing", () => {
    const result = comparableWindows([
      account("a", [window("week", 20)]),
      account("b", [window("week", 80)]),
    ]);
    expect(result).toEqual({
      comparable: true,
      best: [{ id: "week", label: "week", percentRemaining: 80, alias: "b" }],
    });
  });
  it("refuses to merge unlike window sets", () => {
    expect(
      comparableWindows([
        account("a", [window("week", 20)]),
        account("b", [window("five", 80)]),
      ]),
    ).toEqual({ comparable: false, best: [] });
  });
});
