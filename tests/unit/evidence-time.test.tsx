// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EvidenceTime } from "@/components/evidence-time";

const UPDATED_AT = Date.parse("2035-01-01T00:00:00Z");

afterEach(cleanup);

describe("successful allowance evidence time", () => {
  it("crosses the minute boundary while preserving the authoritative timestamp", () => {
    const view = render(
      <EvidenceTime
        updatedAt={UPDATED_AT}
        now={UPDATED_AT + 59_999}
        subject="Claude session allowance evidence"
      />,
    );
    expect(screen.getByText(/updated just now/u)).toBeTruthy();

    view.rerender(
      <EvidenceTime
        updatedAt={UPDATED_AT}
        now={UPDATED_AT + 60_000}
        subject="Claude session allowance evidence"
      />,
    );
    const time = screen.getByText(/updated 1 minute ago/u).closest("time");
    expect(time?.getAttribute("datetime")).toBe("2035-01-01T00:00:00.000Z");

    view.rerender(
      <EvidenceTime
        updatedAt={UPDATED_AT}
        now={UPDATED_AT + 4 * 60_000}
        subject="Claude session allowance evidence"
      />,
    );
    expect(screen.getByText(/updated 4 minutes ago/u)).toBeTruthy();
    expect(
      screen
        .getByText(/updated 4 minutes ago/u)
        .closest("time")
        ?.getAttribute("datetime"),
    ).toBe("2035-01-01T00:00:00.000Z");
  });

  it("exposes relative and absolute local time to assistive technology", () => {
    render(
      <EvidenceTime
        updatedAt={UPDATED_AT}
        now={UPDATED_AT + 4 * 60_000}
        subject="Fable weekly allowance evidence"
      />,
    );
    const time = screen.getByText(/updated 4 minutes ago/u).closest("time");
    expect(time?.getAttribute("aria-label")).toMatch(
      /Fable weekly allowance evidence updated 4 minutes ago; absolute local time/u,
    );
    expect(time?.getAttribute("title")).toMatch(/^Absolute local time:/u);
  });

  it("does not invent missing or future-clock ages", () => {
    const view = render(
      <EvidenceTime
        updatedAt={null}
        now={UPDATED_AT}
        subject="Codex allowance evidence"
      />,
    );
    expect(
      screen
        .getByText("successful update time unavailable")
        .getAttribute("aria-label"),
    ).toMatch(/no time was inferred/u);

    view.rerender(
      <EvidenceTime
        updatedAt={UPDATED_AT + 60_000}
        now={UPDATED_AT}
        subject="Codex allowance evidence"
      />,
    );
    expect(screen.getByText(/ahead of the local clock/u)).toBeTruthy();
  });
});
