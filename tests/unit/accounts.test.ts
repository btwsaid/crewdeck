import { describe, expect, it } from "vitest";
import { buildAccountsSnapshot, comparableWindows } from "@/server/accounts";
import type {
  AccountView,
  DetectedProfile,
  ProviderQuota,
  QuotaSnapshot,
  QuotaWindow,
} from "@/server/contracts";

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
  it("does not assign provider totals across registered accounts", () => {
    const providerTotal: ProviderQuota = {
      provider: "claude",
      label: "Claude",
      accountAlias: null,
      plan: "synthetic",
      sourceKind: "oauth",
      state: { status: "fresh", refreshedAt: 1 },
      windows: [window("five_hour", 73), window("seven_day", 61)],
      reason: null,
      queryError: null,
      limitingWindowIds: ["seven_day"],
      relationship: "unknown",
    };
    const quota: QuotaSnapshot = {
      generatedAt: 1,
      schemaVersion: 3,
      source: { status: "live", refreshedAt: 1, reason: null },
      providers: [providerTotal],
    };
    const result = buildAccountsSnapshot(
      [
        { alias: "flagship", sourceId: "claude:oauth-profile:····a4f2" },
        { alias: "reserve", sourceId: "claude:oauth-profile:····c81d" },
      ],
      quota,
      [],
      "stable profile identifiers unavailable",
      2,
    );
    expect(result.accounts).toHaveLength(2);
    expect(
      result.accounts.map((registration) => ({
        alias: registration.alias,
        state: registration.state.status,
        windows: registration.windows,
      })),
    ).toEqual([
      { alias: "flagship", state: "unavailable", windows: [] },
      { alias: "reserve", state: "unavailable", windows: [] },
    ]);
  });

  it("enables detection only for an authoritatively supplied stable masked profile", () => {
    const detected: DetectedProfile = {
      provider: "claude",
      sourceId: "claude:oauth-profile:····a4f2",
      plan: "synthetic",
      state: "fresh",
    };
    const quota: QuotaSnapshot = {
      generatedAt: 1,
      schemaVersion: 3,
      source: { status: "live", refreshedAt: 1, reason: null },
      providers: [],
    };

    expect(buildAccountsSnapshot([], quota, [detected], null, 2)).toMatchObject(
      {
        detection: { status: "ready", reason: null },
        detected: [detected],
      },
    );
    expect(
      buildAccountsSnapshot(
        [],
        quota,
        [],
        "safe provider totals have no stable profile identifiers",
        2,
      ),
    ).toMatchObject({
      detection: {
        status: "unsupported",
        reason: "safe provider totals have no stable profile identifiers",
      },
      detected: [],
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
