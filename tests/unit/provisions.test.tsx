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
            observedAt: Date.parse("2035-01-01T01:00:00Z"),
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
  it("renders a supplied Claude window and marks a missing core window without inventing Fable", () => {
    render(
      <Provisions
        quota={snapshot(provider([quotaWindow("five_hour", "session")]))}
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
  });

  it("states the exact no-evidence boundary for provider failures", () => {
    render(
      <Provisions
        quota={snapshot(
          provider([], "auth_required", "Claude sign-in required"),
        )}
      />,
    );

    expect(screen.getByText("Claude sign-in required")).toBeTruthy();
    expect(screen.getByText(/source supplied no quota windows/u)).toBeTruthy();
    expect(screen.getByText("auth_required · no data")).toBeTruthy();
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
    render(<Provisions quota={snapshot(provider([staleWindow], "stale"))} />);

    expect(screen.getByText("stale", { exact: true })).toBeTruthy();
    expect(screen.getByText(/last authoritative/u)).toBeTruthy();
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
      observedAt: Date.parse("2035-01-01T01:00:00Z"),
      reason: "Claude quota endpoint rate limited",
    };
    render(<Provisions quota={snapshot(row)} />);

    expect(
      screen.getAllByText("Latest source query failed", { exact: false }),
    ).toHaveLength(2);
    expect(screen.getAllByText(/last authoritative/u).length).toBeGreaterThan(
      0,
    );
    expect(
      screen.getAllByText(/Claude quota endpoint rate limited/u),
    ).toHaveLength(2);
  });

  it("labels first-start rate limiting as unknown rather than exhausted", () => {
    render(
      <Provisions
        quota={snapshot(
          provider([], "rate_limited", "Claude quota endpoint rate limited"),
        )}
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
  });
});
