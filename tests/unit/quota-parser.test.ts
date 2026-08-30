import { describe, expect, it } from "vitest";
import {
  parseQuotaPayload,
  quotaExecutionError,
  retainLastGoodClaude,
} from "@/server/quota-parser";
import { assertCleanPayload } from "@/server/safety";
import schemaV5Fixture from "../fixtures/quota-schema-v5.json";

const base = {
  schemaVersion: 3,
  generatedAt: "2035-01-01T00:00:00.000Z",
  providers: [
    {
      provider: "claude",
      label: "Claude",
      plan: "max",
      source: "oauth",
      state: {
        status: "fresh",
        stale: false,
        refreshedAt: "2035-01-01T00:00:00.000Z",
      },
      windows: [
        {
          id: "five_hour",
          label: "5-hour",
          kind: "rolling",
          percentRemaining: 12,
          resetsAt: "2035-01-01T01:00:00.000Z",
          windowSeconds: 18_000,
          pace: { status: "behind", burnMultiple: 1.4, elapsedPercent: 80 },
        },
        {
          id: "seven_day",
          label: "week",
          kind: "weekly",
          percentRemaining: null,
          resetsAt: null,
          windowSeconds: 604_800,
          pace: { status: "unknown" },
        },
        {
          id: "model:fable",
          label: "Fable week",
          kind: "model",
          percentRemaining: 63,
          resetsAt: "2035-01-07T00:00:00.000Z",
          windowSeconds: 604_800,
          pace: { status: "ahead" },
        },
      ],
      quotaSemantics: {
        status: "known",
        effectiveAvailability: [
          {
            scope: "all_models",
            limitingWindowIds: ["seven_day", "not_a_reported_window"],
          },
          {
            scope: "model:fable",
            limitingWindowIds: ["seven_day"],
          },
        ],
      },
      accounts: [{ email: ["private", "example.invalid"].join("@") }],
      futureField: "excluded",
    },
  ],
  accounts: [{ nativeCredential: "excluded" }],
};

describe("quota schema v5", () => {
  it("maps the authoritative default --json contract without inferring demoted fields", () => {
    const result = parseQuotaPayload(schemaV5Fixture, 10);
    const claude = result.providers[0];

    expect(result).toMatchObject({
      schemaVersion: 5,
      source: {
        status: "partial",
        refreshedAt: Date.parse("2035-01-01T00:00:00.000Z"),
      },
    });
    expect(claude).toMatchObject({
      provider: "claude",
      label: "Claude",
      sourceKind: "not reported",
      state: { status: "fresh", refreshedAt: null },
      limitingWindowIds: ["seven_day"],
    });
    expect(claude.windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day",
      "model:fable",
    ]);
    expect(claude.windows[0]).toMatchObject({
      percentRemaining: 72,
      resetsAt: Date.parse("2035-01-01T02:00:00.000Z"),
      windowSeconds: null,
      elapsedPercent: null,
      pace: {
        status: "behind",
        burnMultiple: 0.6,
        projectedExhaustedAt: null,
      },
    });
    expect(result.providers[1]).toMatchObject({
      provider: "codex",
      label: "Codex",
      state: { status: "auth_required", refreshedAt: null },
      windows: [],
      reason: "Synthetic Codex sign-in required",
    });
    expect(() => assertCleanPayload(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toMatch(
      /(?:effectivePercentRemaining|reservePercentPoints|spendPriority|authStatus)/u,
    );
  });

  it("keeps malformed schema-v5 evidence explicit and guesses no values", () => {
    const result = parseQuotaPayload({
      schemaVersion: 5,
      generatedAt: "not-a-date",
      providers: [
        {
          provider: "claude",
          state: { status: "fresh", stale: false },
          windows: [
            null,
            {
              id: "five_hour",
              label: "session",
              kind: "session",
              percentRemaining: 900,
              resetsAt: "not-a-date",
            },
          ],
        },
      ],
    });

    expect(result.source).toMatchObject({
      status: "partial",
      refreshedAt: null,
      reason: expect.stringMatching(/1 malformed window record/u),
    });
    expect(result.providers[0].windows[0]).toMatchObject({
      percentRemaining: null,
      resetsAt: null,
      windowSeconds: null,
    });
  });

  it("rejects a malformed root contract without treating it as an unknown version", () => {
    const result = parseQuotaPayload({ schemaVersion: 5, providers: {} });
    expect(result).toMatchObject({
      schemaVersion: 5,
      source: {
        status: "error",
        reason: "malformed quota source payload — providers must be an array",
      },
      providers: [],
    });
  });
});

describe("quota schema v3", () => {
  it("maps authoritative windows field-by-field, including Fable", () => {
    const result = parseQuotaPayload(base, 10);
    expect(result.schemaVersion).toBe(3);
    expect(result.providers[0].windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day",
      "model:fable",
    ]);
    expect(result.providers[0].windows[1].percentRemaining).toBeNull();
    expect(result.providers[0].windows[0]).toMatchObject({
      percentRemaining: 12,
      resetsAt: Date.parse("2035-01-01T01:00:00.000Z"),
      windowSeconds: 18_000,
      pace: { status: "behind", burnMultiple: 1.4 },
    });
    expect(result.providers[0].limitingWindowIds).toEqual(["seven_day"]);
    expect(() => assertCleanPayload(result)).not.toThrow();
    expect(JSON.stringify(result)).not.toContain("accounts");
  });

  it("retains schema v3 and fails closed on missing or unknown schema versions", () => {
    expect(parseQuotaPayload(base, 10).source.status).toBe("live");
    for (const payload of [
      { ...base, schemaVersion: 4 },
      { ...base, schemaVersion: 99 },
      { providers: base.providers },
    ]) {
      const result = parseQuotaPayload(payload, 10);
      expect(result.source.status).toBe("unsupported");
      expect(result.providers).toEqual([]);
      expect(result.source.reason).toContain("expected version 3 or 5");
    }
  });

  it("never substitutes parser or payload generation time for a missing successful evidence time", () => {
    const missing = structuredClone(base);
    delete (
      missing.providers[0].state as Partial<(typeof base.providers)[0]["state"]>
    ).refreshedAt;
    const result = parseQuotaPayload(
      missing,
      Date.parse("2035-01-01T00:04:00Z"),
    );

    expect(result.source.refreshedAt).toBe(
      Date.parse("2035-01-01T00:00:00.000Z"),
    );
    expect(result.providers[0].state.refreshedAt).toBeNull();
    expect(result.providers[0].windows).not.toHaveLength(0);
  });

  it("does not infer malformed percentages or resets", () => {
    const hostile = structuredClone(base);
    hostile.providers[0].windows[0].percentRemaining = 900;
    hostile.providers[0].windows[0].resetsAt = "not-a-date";
    const window = parseQuotaPayload(hostile).providers[0].windows[0];
    expect(window.percentRemaining).toBeNull();
    expect(window.resetsAt).toBeNull();
  });

  it("keeps missing Claude windows missing and optional Fable absent", () => {
    const partial = structuredClone(base);
    partial.providers[0].windows = [partial.providers[0].windows[0]];
    partial.providers[0].state.status = "stale";
    partial.providers[0].state.stale = true;
    const provider = parseQuotaPayload(partial).providers[0];
    expect(provider.state.status).toBe("stale");
    expect(provider.windows.map((window) => window.id)).toEqual(["five_hour"]);
    expect(provider.limitingWindowIds).toEqual([]);
  });

  it("separates a source-supplied stale cache from its latest query error", () => {
    const payload = structuredClone(base);
    payload.providers[0].source = "cache";
    payload.providers[0].state.status = "stale";
    payload.providers[0].state.stale = true;
    const state = payload.providers[0]
      .state as (typeof payload.providers)[0]["state"] & { error?: string };
    state.error = "Claude quota endpoint rate limited";
    const provider = parseQuotaPayload(payload, 20).providers[0];

    expect(provider.state.status).toBe("stale");
    expect(provider.windows).toHaveLength(3);
    expect(provider.queryError).toEqual({
      observedAt: 20,
      reason: "Claude quota endpoint rate limited",
    });
  });

  it("preserves exact partial and provider failure states", () => {
    const payload: unknown = {
      ...structuredClone(base),
      providers: [
        ...structuredClone(base.providers),
        {
          provider: "codex",
          label: "Codex",
          plan: null,
          source: "unavailable",
          state: { status: "rate_limited", stale: false, refreshedAt: null },
          windows: [],
          accounts: [],
          futureField: "excluded",
        },
      ],
    };
    const result = parseQuotaPayload(payload);
    expect(result.source.status).toBe("partial");
    expect(result.providers[1].state.status).toBe("rate_limited");
    expect(result.providers[1].reason).toMatch(/rate limited/u);
    expect(result.providers[1].queryError).toMatchObject({
      reason: expect.stringMatching(/rate limited/u),
    });
  });

  it("keeps a provider with no authoritative evidence explicit", () => {
    const payload = structuredClone(base);
    payload.providers[0].state.status = "auth_required";
    payload.providers[0].state.stale = false;
    payload.providers[0].windows = [];
    const provider = parseQuotaPayload(payload).providers[0];
    expect(provider).toMatchObject({
      provider: "claude",
      state: { status: "auth_required" },
      windows: [],
      queryError: null,
    });
    expect(provider.reason).toMatch(/official provider CLI/u);
  });
});

describe("last-good Claude evidence", () => {
  const observedAt = Date.parse("2035-01-01T00:10:00Z");

  function failedClaude(status: "rate_limited" | "auth_required") {
    const payload = structuredClone(base);
    payload.generatedAt = new Date(observedAt + 60_000).toISOString();
    payload.providers[0].state.status = status;
    payload.providers[0].state.stale = false;
    const state = payload.providers[0]
      .state as (typeof payload.providers)[0]["state"] & {
      error?: string;
    };
    state.error =
      status === "rate_limited"
        ? "Claude quota endpoint rate limited"
        : "Claude sign-in required";
    payload.providers[0].windows = [];
    return parseQuotaPayload(payload, observedAt + 60_000);
  }

  it("retains unexpired windows as stale when a later source query is rate limited", () => {
    const lastGood = parseQuotaPayload(base, observedAt);
    const result = retainLastGoodClaude(
      failedClaude("rate_limited"),
      lastGood,
      observedAt + 60_000,
    );
    const claude = result.providers[0];

    expect(result.source.status).toBe("stale");
    expect(claude.state).toEqual({
      status: "stale",
      refreshedAt: Date.parse(base.providers[0].state.refreshedAt),
    });
    expect(claude.windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day",
      "model:fable",
    ]);
    expect(
      claude.windows.every((window) => window.pace.status === "unknown"),
    ).toBe(true);
    expect(claude.queryError).toMatchObject({
      observedAt: observedAt + 60_000,
      reason: "Claude quota endpoint rate limited",
    });
    expect(claude.limitingWindowIds).toEqual([]);
  });

  it("reports first-start rate limiting without fabricating evidence", () => {
    const result = retainLastGoodClaude(
      failedClaude("rate_limited"),
      quotaExecutionError("not collected yet", observedAt),
      observedAt + 60_000,
    );
    expect(result.providers[0]).toMatchObject({
      state: { status: "rate_limited" },
      windows: [],
    });
  });

  it("replaces retained evidence on recovery and leaves Codex untouched", () => {
    const lastGood = parseQuotaPayload(base, observedAt);
    const stale = retainLastGoodClaude(
      failedClaude("rate_limited"),
      lastGood,
      observedAt + 60_000,
    );
    const recoveredPayload = structuredClone(base);
    recoveredPayload.providers[0].windows[0].percentRemaining = 77;
    const recovered = parseQuotaPayload(recoveredPayload, observedAt + 120_000);
    const codex = {
      ...recovered.providers[0],
      provider: "codex",
      label: "Codex",
      windows: [
        {
          ...recovered.providers[0].windows[0],
          id: "weekly",
          label: "week",
        },
      ],
    };
    recovered.providers.push(codex);

    const result = retainLastGoodClaude(recovered, stale, observedAt + 120_000);
    expect(result.providers[0]).toMatchObject({
      state: { status: "fresh" },
      queryError: null,
    });
    expect(result.providers[0].windows[0].percentRemaining).toBe(77);
    expect(result.providers[1]).toBe(codex);
  });

  it("expires old evidence and clears it for definitive authentication failure", () => {
    const lastGood = parseQuotaPayload(base, observedAt);
    const expired = retainLastGoodClaude(
      failedClaude("rate_limited"),
      lastGood,
      Date.parse("2035-01-08T00:00:00Z"),
    );
    expect(expired.providers[0].windows).toEqual([]);
    expect(expired.providers[0].state.status).toBe("rate_limited");

    const signedOut = retainLastGoodClaude(
      failedClaude("auth_required"),
      lastGood,
      observedAt + 60_000,
    );
    expect(signedOut.providers[0]).toMatchObject({
      state: { status: "auth_required" },
      windows: [],
    });
  });
});
