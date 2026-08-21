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
      screen.getAllByText("authoritative source is rate limited"),
    ).toHaveLength(2);
  });

  it("keeps stale values visible and missing resets explicit", () => {
    const staleWindow = quotaWindow("seven_day", "week");
    staleWindow.resetsAt = null;
    render(<Provisions quota={snapshot(provider([staleWindow], "stale"))} />);

    expect(screen.getByText("stale", { exact: true })).toBeTruthy();
    expect(screen.getByText("resets reset unavailable")).toBeTruthy();
    expect(screen.getByText("· absolute reset unavailable")).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Claude 5-hour session not reported" }),
    ).toBeTruthy();
  });
});
