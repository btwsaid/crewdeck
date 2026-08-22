import { afterEach, describe, expect, it } from "vitest";
import type { QuotaState } from "./live-fixture";
import { CrewdeckService } from "@/server/service";
import { createSyntheticLiveFixture } from "./live-fixture";

const services: CrewdeckService[] = [];

afterEach(() => {
  for (const service of services) service.close();
  services.length = 0;
});

async function serviceFor(
  options: Parameters<typeof createSyntheticLiveFixture>[0] = {},
) {
  const fixture = await createSyntheticLiveFixture(options);
  const service = new CrewdeckService(fixture.config);
  services.push(service);
  await service.ensureStarted();
  return { fixture, service };
}

async function refreshQuota(
  service: CrewdeckService,
  writeQuotaState: (state: QuotaState) => Promise<void>,
  state: QuotaState,
) {
  await writeQuotaState(state);
  const internal = service as unknown as {
    quotaTimer: NodeJS.Timeout | null;
    refreshQuota(): Promise<void>;
  };
  if (internal.quotaTimer) clearTimeout(internal.quotaTimer);
  internal.quotaTimer = null;
  await internal.refreshQuota();
}

describe("Claude quota collection lifecycle", () => {
  it("collects logged-in Claude evidence without a Claude worker, retains it across rate limiting, recovers, and clears it on definitive sign-out", async () => {
    const { fixture, service } = await serviceFor({ workerHarness: "pi" });
    expect(service.snapshots().fleet.workers).not.toEqual([]);
    expect(
      service
        .snapshots()
        .fleet.workers.every((worker) => worker.runtime !== "claude"),
    ).toBe(true);
    const initialClaude = service
      .snapshots()
      .quota.providers.find((provider) => provider.provider === "claude");
    expect(initialClaude).toMatchObject({
      state: { status: "fresh" },
      queryError: null,
    });
    expect(initialClaude?.windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day",
      "model:fable",
    ]);

    await refreshQuota(service, fixture.writeQuotaState, {
      percentRemaining: 0,
      claudeStatus: "rate_limited",
    });
    const retained = service
      .snapshots()
      .quota.providers.find((provider) => provider.provider === "claude");
    expect(retained).toMatchObject({
      state: { status: "stale" },
      queryError: { reason: "Claude quota endpoint rate limited" },
    });
    expect(
      retained?.windows.map((window) => ({
        id: window.id,
        percentRemaining: window.percentRemaining,
      })),
    ).toEqual([
      { id: "five_hour", percentRemaining: 71 },
      { id: "seven_day", percentRemaining: 64 },
      { id: "model:fable", percentRemaining: 71 },
    ]);

    await refreshQuota(service, fixture.writeQuotaState, {
      percentRemaining: 52,
      claudeStatus: "fresh",
    });
    const recovered = service
      .snapshots()
      .quota.providers.find((provider) => provider.provider === "claude");
    expect(recovered).toMatchObject({
      state: { status: "fresh" },
      queryError: null,
    });
    expect(recovered?.windows[0]).toMatchObject({
      id: "five_hour",
      percentRemaining: 52,
    });

    await refreshQuota(service, fixture.writeQuotaState, {
      percentRemaining: 0,
      claudeStatus: "auth_required",
    });
    expect(
      service
        .snapshots()
        .quota.providers.find((provider) => provider.provider === "claude"),
    ).toMatchObject({
      state: { status: "auth_required" },
      windows: [],
      queryError: null,
    });
    expect(
      service
        .snapshots()
        .quota.providers.find((provider) => provider.provider === "codex")
        ?.state.status,
    ).toBe("fresh");
  });

  it("reports first-start rate limiting with no evidence and does not fabricate windows", async () => {
    const { service } = await serviceFor({
      initialQuotaState: {
        percentRemaining: 0,
        claudeStatus: "rate_limited",
      },
    });
    expect(
      service
        .snapshots()
        .quota.providers.find((provider) => provider.provider === "claude"),
    ).toMatchObject({
      state: { status: "rate_limited" },
      windows: [],
      queryError: { reason: "Claude quota endpoint rate limited" },
    });
  });

  it("collects the same authoritative windows when a Claude worker is active", async () => {
    const { service } = await serviceFor({ workerHarness: "claude" });
    expect(
      service
        .snapshots()
        .fleet.workers.some((worker) => worker.runtime === "claude"),
    ).toBe(true);
    const claude = service
      .snapshots()
      .quota.providers.find((provider) => provider.provider === "claude");
    expect(claude?.state.status).toBe("fresh");
    expect(claude?.windows.map((window) => window.id)).toEqual([
      "five_hour",
      "seven_day",
      "model:fable",
    ]);
  });
});
