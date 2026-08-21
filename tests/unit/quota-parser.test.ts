import { describe, expect, it } from "vitest";
import { parseQuotaPayload } from "@/server/quota-parser";
import { assertCleanPayload } from "@/server/safety";

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

  it("fails closed on unsupported schema versions", () => {
    const result = parseQuotaPayload({ ...base, schemaVersion: 99 }, 10);
    expect(result.source.status).toBe("unsupported");
    expect(result.providers).toEqual([]);
    expect(result.source.reason).toContain("expected version 3");
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
    });
    expect(provider.reason).toMatch(/official provider CLI/u);
  });
});
