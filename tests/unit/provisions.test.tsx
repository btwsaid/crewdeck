// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Provisions } from "@/components/provisions";
import type {
  ProviderQuota,
  QuotaSnapshot,
  QuotaState,
  QuotaWindow,
} from "@/server/contracts";
import { parseQuotaPayload } from "@/server/quota-parser";
import schemaV5Fixture from "../fixtures/quota-schema-v5.json";

const NOW = Date.parse("2035-01-01T00:04:00Z");

function quotaWindow(id: string, label: string): QuotaWindow {
  return {
    id,
    label,
    kind: id === "five_hour" ? "session" : "weekly",
    percentRemaining: 42,
    resetsAt: Date.parse("2035-01-02T00:00:00Z"),
    windowSeconds: id === "five_hour" ? 18_000 : 604_800,
    elapsedPercent: null,
    pace: {
      status: "unknown",
      burnMultiple: null,
      projectedExhaustedAt: null,
      projectionConfidence: null,
    },
  };
}

function provider(
  windows: QuotaWindow[],
  status: QuotaState = "fresh",
  reason: string | null = null,
): ProviderQuota {
  return {
    provider: "claude",
    label: "Claude",
    accountAlias: null,
    plan: null,
    sourceKind: "oauth",
    state: { status, refreshedAt: Date.parse("2035-01-01T00:00:00Z") },
    windows,
    reason,
    queryError:
      status === "rate_limited" || status === "error"
        ? {
            observedAt: NOW,
            reason: reason ?? "source query failed",
          }
        : null,
    limitingWindowIds: [],
    relationship: "unknown",
  };
}

function snapshot(row: ProviderQuota): QuotaSnapshot {
  return {
    generatedAt: Date.parse("2035-01-01T00:00:00Z"),
    schemaVersion: 3,
    source: { status: "live", refreshedAt: null, reason: null },
    providers: [row],
  };
}

afterEach(cleanup);

describe("quota evidence presentation", () => {
  it("renders parsed schema-v5 facts and keeps its demoted evidence times explicit", () => {
    render(
      <Provisions quota={parseQuotaPayload(schemaV5Fixture, NOW)} now={NOW} />,
    );

    expect(
      screen.getByRole("img", {
        name: /Claude session: 72 percent remaining/u,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", {
        name: /Claude Fable week: 81 percent remaining/u,
      }),
    ).toBeTruthy();
    expect(screen.getByText("Synthetic Codex sign-in required")).toBeTruthy();
    expect(
      screen.getAllByText("successful update time unavailable"),
    ).toHaveLength(3);
    expect(screen.queryByText(/unsupported quota source schema/u)).toBeNull();
  });

  it("renders a supplied Claude window and marks a missing core window without inventing Fable", () => {
    render(
      <Provisions
        quota={snapshot(provider([quotaWindow("five_hour", "session")]))}
        now={NOW}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /Claude session: 42 percent remaining/u,
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Claude week not reported" }),
    ).toBeTruthy();
    expect(screen.getByText("missing · no data")).toBeTruthy();
    expect(screen.queryByText(/Fable/u)).toBeNull();
    expect(screen.getAllByText(/updated 4 minutes ago/u)).toHaveLength(2);
  });

  it("states the exact no-evidence boundary for provider failures", () => {
    render(
      <Provisions
        quota={snapshot(
          provider([], "auth_required", "Claude sign-in required"),
        )}
        now={NOW}
      />,
    );

    expect(screen.getByText("Claude sign-in required")).toBeTruthy();
    expect(screen.getByText(/source supplied no quota windows/u)).toBeTruthy();
    expect(screen.getByText("auth_required · no data")).toBeTruthy();
    expect(
      screen.getByText(/credentials are absent, expired, or revoked/u),
    ).toBeTruthy();
    expect(screen.getByText(/update time unavailable/u)).toBeTruthy();
  });

  it("keeps supplied windows visible with an exact provider failure state", () => {
    render(
      <Provisions
        quota={snapshot(
          provider(
            [
              quotaWindow("five_hour", "session"),
              quotaWindow("seven_day", "week"),
            ],
            "rate_limited",
            "authoritative source is rate limited",
          ),
        )}
        now={NOW}
      />,
    );

    expect(
      screen.getByRole("img", {
        name: /Claude session: 42 percent remaining/u,
      }),
    ).toBeTruthy();
    expect(screen.getAllByText("rate_limited", { exact: true })).toHaveLength(
      2,
    );
    expect(
      screen
        .getAllByRole("status")
        .filter((element) =>
          element.textContent?.includes("authoritative source is rate limited"),
        ),
    ).toHaveLength(2);
  });

  it("keeps stale values visible and missing resets explicit", () => {
    const staleWindow = quotaWindow("seven_day", "week");
    staleWindow.resetsAt = null;
    render(
      <Provisions
        quota={snapshot(provider([staleWindow], "stale"))}
        now={NOW}
      />,
    );

    expect(screen.getByText(/stale · retained evidence/u)).toBeTruthy();
    expect(screen.getAllByText(/updated 4 minutes ago/u)).not.toHaveLength(0);
    expect(screen.getByText("resets reset unavailable")).toBeTruthy();
    expect(screen.getByText("· absolute reset unavailable")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Claude 5-hour session not reported" }),
    ).toBeTruthy();
  });

  it("separates a stale allowance observation from the latest source-query failure", () => {
    const row = provider(
      [quotaWindow("five_hour", "session"), quotaWindow("seven_day", "week")],
      "stale",
      "Last authoritative Claude allowance is retained while the latest source query is unavailable.",
    );
    row.queryError = {
      observedAt: NOW,
      reason: "Claude quota endpoint rate limited",
    };
    render(<Provisions quota={snapshot(row)} now={NOW} />);

    expect(
      screen.getAllByText("Latest source query failed", { exact: false }),
    ).toHaveLength(2);
    expect(
      screen.getAllByText(/updated 4 minutes ago/u).length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText(/Claude quota endpoint rate limited/u),
    ).toHaveLength(2);
    expect(screen.getAllByText(/updated 4 minutes ago/u)).toHaveLength(2);
    expect(screen.getAllByText(/problem observed just now/u)).toHaveLength(2);
    expect(
      screen
        .getAllByLabelText(
          /Claude .* allowance evidence updated 4 minutes ago/u,
        )
        .every(
          (element) =>
            element.getAttribute("datetime") === "2035-01-01T00:00:00.000Z",
        ),
    ).toBe(true);
  });

  it("labels first-start rate limiting as unknown rather than exhausted", () => {
    render(
      <Provisions
        quota={snapshot(
          provider([], "rate_limited", "Claude quota endpoint rate limited"),
        )}
        now={NOW}
      />,
    );

    expect(
      screen.getByText(/No last-known authoritative Claude allowance/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/Allowance is unknown — not exhausted/u),
    ).toBeTruthy();
    expect(
      screen.getByText(/no Claude process needs to stay running/u),
    ).toBeTruthy();
    expect(screen.getByText(/no retained last-good evidence/u)).toBeTruthy();
    expect(screen.getByText(/update time unavailable/u)).toBeTruthy();
  });

  it("labels Claude, Codex, and optional Fable values with their own provider evidence time", () => {
    const claude = provider([
      quotaWindow("five_hour", "session"),
      quotaWindow("seven_day", "week"),
      quotaWindow("model:fable", "Fable week"),
    ]);
    const codex = provider([quotaWindow("weekly", "week")]);
    codex.provider = "codex";
    codex.label = "Codex";
    const quota = snapshot(claude);
    quota.providers.push(codex);

    render(<Provisions quota={quota} now={NOW} />);

    expect(
      screen.getByLabelText(
        /Claude Fable week allowance evidence updated 4 minutes ago; absolute local time/u,
      ),
    ).toBeTruthy();
    expect(
      screen.getByLabelText(
        /Codex week allowance evidence updated 4 minutes ago; absolute local time/u,
      ),
    ).toBeTruthy();
  });

  it("shows values but never invents a successful timestamp when the source omitted it", () => {
    const row = provider([
      quotaWindow("five_hour", "session"),
      quotaWindow("seven_day", "week"),
    ]);
    row.state.refreshedAt = null;

    render(<Provisions quota={snapshot(row)} now={NOW} />);

    expect(
      screen.getByRole("img", {
        name: /Claude session: 42 percent remaining/u,
      }),
    ).toBeTruthy();
    expect(
      screen.getAllByText("successful update time unavailable"),
    ).toHaveLength(2);
    expect(
      screen
        .getAllByText("successful update time unavailable")[0]
        .getAttribute("aria-label"),
    ).toMatch(/no time was inferred/u);
  });
});
