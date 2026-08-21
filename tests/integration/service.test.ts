import { access, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { StreamEvent } from "@/server/contracts";
import { CrewdeckService } from "@/server/service";

describe("snapshot and stream service", () => {
  it("emits clean synthetic snapshots, scenario updates, and heartbeats without live-data persistence", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-service-"));
    const accountsFile = join(directory, "accounts.json");
    const service = new CrewdeckService({
      demo: true,
      fmHome: null,
      fleetCommand: null,
      quotaCommand: "unused",
      accountsFile,
    });
    const events: StreamEvent[] = [];
    const unsubscribe = service.subscribe((event) => events.push(event));
    await service.ensureStarted();
    expect(service.snapshots().fleet.workers.length).toBeGreaterThan(0);
    await service.setScenario("empty");
    expect(service.snapshots().fleet.workers).toEqual([]);
    await service.setScenario("stale");
    expect(service.snapshots().fleet.source.status).toBe("stale");
    await service.setScenario("live");
    expect(service.snapshots().fleet.source.status).toBe("live");
    expect(events.some((event) => event.type === "fleet")).toBe(true);
    await expect(access(accountsFile)).rejects.toThrow();
    unsubscribe();
    service.close();
  });

  it("supports add, rename, and Crewdeck-only disconnect in memory for public demos", async () => {
    const directory = await mkdtemp(join(tmpdir(), "crewdeck-service-"));
    const service = new CrewdeckService({
      demo: true,
      fmHome: null,
      fleetCommand: null,
      quotaCommand: "unused",
      accountsFile: join(directory, "accounts.json"),
    });
    await service.ensureStarted();
    const profile = service.snapshots().accounts.detected[0];
    await service.registerAccount("new reserve", profile.sourceId);
    expect(
      service
        .snapshots()
        .accounts.accounts.some((account) => account.alias === "new reserve"),
    ).toBe(true);
    await service.renameAccount(profile.sourceId, "renamed reserve");
    expect(
      service
        .snapshots()
        .accounts.accounts.some(
          (account) => account.alias === "renamed reserve",
        ),
    ).toBe(true);
    await service.disconnectAccount(profile.sourceId);
    expect(
      service
        .snapshots()
        .accounts.accounts.some(
          (account) => account.sourceId === profile.sourceId,
        ),
    ).toBe(false);
    service.close();
  });
});
