// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountsView } from "@/components/accounts-view";
import type { AccountsSnapshot } from "@/server/contracts";

afterEach(cleanup);

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
