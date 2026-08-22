// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsView } from "@/components/accounts-view";
import { demoAccounts, initialDemoAccounts } from "@/server/demo";
import type { AccountsSnapshot } from "@/server/contracts";

const NOW = Date.parse("2035-01-01T04:00:00Z");

afterEach(cleanup);

describe("account allowance evidence timing", () => {
  it("keeps profile times separate and gives each best-per-window value its winning profile time", () => {
    render(
      <AccountsView
        snapshot={demoAccounts("live", NOW, initialDemoAccounts(NOW))}
        now={NOW}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    const flagship = screen
      .getByText("flagship", { exact: true })
      .closest("article");
    const nightWatch = screen
      .getByText("night-watch", { exact: true })
      .closest("article");
    expect(flagship).not.toBeNull();
    expect(nightWatch).not.toBeNull();
    expect(within(flagship!).getAllByText(/updated just now/u)).toHaveLength(3);
    expect(
      within(nightWatch!).getAllByText(/updated 3 hours ago/u),
    ).toHaveLength(3);
    expect(
      within(nightWatch!).getByText("Latest profile query failed", {
        exact: false,
      }),
    ).toBeTruthy();
    expect(
      within(nightWatch!).getByText(/problem observed 2 minutes ago/u),
    ).toBeTruthy();

    const overview = screen
      .getByText(/claude · all accounts/u)
      .closest("article");
    expect(overview).not.toBeNull();
    const winningFiveHour = within(overview!).getByText(
      "best 96% · night-watch",
    );
    const winningRow = winningFiveHour.closest(".acct-win");
    expect(winningRow).not.toBeNull();
    expect(
      within(winningRow as HTMLElement).getByText(/updated 3 hours ago/u),
    ).toBeTruthy();
    expect(overview?.textContent).toMatch(/never an aggregate/u);
  });

  it("keeps missing-time, definitive auth expiry, and unsupported profiles explicit", () => {
    const accounts = initialDemoAccounts(NOW);
    accounts[0] = {
      ...accounts[0],
      state: { ...accounts[0].state, refreshedAt: null },
    };
    render(
      <AccountsView
        snapshot={demoAccounts("live", NOW, accounts)}
        now={NOW}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    const flagship = screen
      .getByText("flagship", { exact: true })
      .closest("article");
    expect(
      within(flagship!).getAllByText("successful update time unavailable"),
    ).toHaveLength(3);

    const signedOut = screen
      .getByText("skiff", { exact: true })
      .closest("article");
    expect(signedOut?.textContent).toMatch(/credential expired/u);
    expect(signedOut?.textContent).toMatch(
      /credentials are absent, expired, or revoked/u,
    );
    expect(signedOut?.textContent).toMatch(/update time unavailable/u);

    const unsupported = screen
      .getByText("chart-room", { exact: true })
      .closest("article");
    expect(unsupported?.textContent).toMatch(
      /registered profile is unsupported/u,
    );
    expect(unsupported?.textContent).toMatch(/update time unavailable/u);
  });
});

describe("profile detection availability", () => {
  it("makes the unsupported reason and safe next action accessible from the control", () => {
    const snapshot: AccountsSnapshot = {
      generatedAt: 1,
      detection: {
        status: "unsupported",
        reason:
          "The safe quota source reports provider totals but no stable masked profile identifiers; no account relationship is inferred",
      },
      accounts: [],
      detected: [],
    };
    render(
      <AccountsView
        snapshot={snapshot}
        now={1}
        mutate={vi.fn(async () => undefined)}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "+ Add account" }));
    const explanation = screen.getByRole("note");
    const unavailable = screen.getByRole("button", {
      name: "Detection unavailable",
    });

    expect(unavailable.getAttribute("aria-disabled")).toBe("true");
    expect(unavailable.getAttribute("aria-describedby")).toBe(explanation.id);
    expect(explanation.textContent).toMatch(
      /no stable masked profile identifiers/u,
    );
    expect(explanation.textContent).toMatch(/Safe next action/u);

    unavailable.focus();
    expect(document.activeElement).toBe(unavailable);
  });
});
