// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Crewdeck } from "@/components/crewdeck";
import {
  demoAccounts,
  demoFleet,
  demoQuota,
  initialDemoAccounts,
} from "@/server/demo";

class FakeEventSource {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<
    string,
    Array<(event: MessageEvent<string>) => void>
  >();
  onerror: (() => void) | null = null;
  closed = false;

  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }

  addEventListener(
    type: string,
    listener: (event: MessageEvent<string>) => void,
  ): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  dispatch(type: string, data: unknown = null): void {
    const event = { data: JSON.stringify(data) } as MessageEvent<string>;
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }

  fail(): void {
    this.onerror?.();
  }

  close(): void {
    this.closed = true;
  }
}

const reconnectBanner =
  "Live feed heartbeat stopped — snapshots are retained while Crewdeck reconnects.";

afterEach(() => {
  cleanup();
  FakeEventSource.instances = [];
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser live-feed recovery", () => {
  it("opens a fresh stream after an SSE error and closes streams and retries during cleanup", async () => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    const responses = new Map<string, unknown>([
      ["/api/fleet", demoFleet("live")],
      ["/api/quota", demoQuota("live")],
      [
        "/api/accounts",
        demoAccounts("live", Date.now(), initialDemoAccounts()),
      ],
      ["/api/health", { ok: true, mode: "live" }],
    ]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL | Request) => {
        const url = typeof input === "string" ? input : input.toString();
        return new Response(JSON.stringify(responses.get(url)), {
          status: responses.has(url) ? 200 : 404,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );
    vi.stubGlobal(
      "EventSource",
      FakeEventSource as unknown as typeof EventSource,
    );
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: false })) as unknown as typeof matchMedia,
    );

    const view = render(<Crewdeck />);
    expect(FakeEventSource.instances).toHaveLength(1);
    const first = FakeEventSource.instances[0];
    expect(first.url).toBe("/api/stream");
    act(() => first.dispatch("heartbeat"));
    expect(screen.getByText("live", { exact: true })).toBeTruthy();

    act(() => first.fail());
    expect(first.closed).toBe(true);
    expect(screen.getByText(reconnectBanner, { exact: false })).toBeTruthy();
    await act(async () => vi.advanceTimersByTimeAsync(999));
    expect(FakeEventSource.instances).toHaveLength(1);
    await act(async () => vi.advanceTimersByTimeAsync(1));
    expect(FakeEventSource.instances).toHaveLength(2);

    const second = FakeEventSource.instances[1];
    act(() => second.dispatch("heartbeat"));
    expect(screen.queryByText(reconnectBanner, { exact: false })).toBeNull();
    expect(screen.getByText("live", { exact: true })).toBeTruthy();

    view.unmount();
    expect(second.closed).toBe(true);
    await act(async () => vi.advanceTimersByTimeAsync(5_000));
    expect(FakeEventSource.instances).toHaveLength(2);
  });
});
