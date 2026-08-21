import { describe, expect, it } from "vitest";
import { parseQuotaPayload, quotaExecutionError } from "@/server/quota-parser";

describe("partial quota providers", () => {
  it("keeps a reporting provider while marking the missing provider exactly", () => {
    const result = parseQuotaPayload({
      schemaVersion: 3,
      generatedAt: "2035-01-01T00:00:00Z",
      providers: [
        {
          provider: "claude",
          label: "Claude",
          plan: "max",
          source: "oauth",
          state: {
            status: "fresh",
            stale: false,
            refreshedAt: "2035-01-01T00:00:00Z",
          },
          windows: [
            {
              id: "five_hour",
              label: "5-hour",
              kind: "rolling",
              percentRemaining: 50,
              resetsAt: "2035-01-01T01:00:00Z",
              windowSeconds: 18_000,
              pace: { status: "ahead" },
            },
          ],
        },
        {
          provider: "codex",
          label: "Codex",
          plan: null,
          source: "unavailable",
          state: {
            status: "error",
            stale: false,
            refreshedAt: null,
            error: { code: "local_source_unavailable" },
          },
          windows: [],
        },
      ],
    });
    expect(result.source.status).toBe("partial");
    expect(result.providers[0].windows).toHaveLength(1);
    expect(result.providers[1]).toMatchObject({
      state: { status: "error" },
      windows: [],
    });
  });

  it("returns explicit no-data execution errors", () => {
    expect(quotaExecutionError("fixture command failed")).toMatchObject({
      source: { status: "error" },
      providers: [],
    });
  });
});
