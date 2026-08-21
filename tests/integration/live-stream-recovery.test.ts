import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as openStream } from "@/app/api/stream/route";
import type { StreamEvent } from "@/server/contracts";
import { assertCleanPayload } from "@/server/safety";
import { CrewdeckService } from "@/server/service";
import { createSyntheticLiveFixture } from "./live-fixture";

const heartbeatMs = 15_000;

function nextEvent<T extends StreamEvent["type"]>(
  service: CrewdeckService,
  type: T,
  predicate: (event: Extract<StreamEvent, { type: T }>) => boolean = () => true,
): Promise<Extract<StreamEvent, { type: T }>> {
  return new Promise((resolve) => {
    let unsubscribe = () => {};
    unsubscribe = service.subscribe((event) => {
      if (event.type !== type) return;
      const selected = event as Extract<StreamEvent, { type: T }>;
      if (!predicate(selected)) return;
      unsubscribe();
      resolve(selected);
    });
  });
}

async function connect() {
  const controller = new AbortController();
  const response = await openStream(
    new Request("http://127.0.0.1:4319/api/stream", {
      signal: controller.signal,
    }),
  );
  return { controller, response, reader: response.body!.getReader() };
}

async function readUntilEvent(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  type: StreamEvent["type"],
): Promise<string> {
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes(`event: ${type}\n`)) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value, { stream: true });
  }
  return text;
}

afterEach(() => {
  globalThis.__crewdeckService?.close();
  globalThis.__crewdeckService = undefined;
  vi.useRealTimers();
});

describe("live SSE recovery", () => {
  it("keeps a path-valued live project private while heartbeats, refreshes, stale recovery, and reconnects continue", async () => {
    vi.useFakeTimers({
      toFake: [
        "Date",
        "setInterval",
        "clearInterval",
        "setTimeout",
        "clearTimeout",
      ],
    });
    const fixture = await createSyntheticLiveFixture();
    const service = new CrewdeckService(fixture.config);
    globalThis.__crewdeckService = service;

    const serviceEvents: StreamEvent[] = [];
    service.subscribe((event) => serviceEvents.push(event));
    let failedListenerCalls = 0;
    service.subscribe(() => {
      failedListenerCalls += 1;
      throw new Error("synthetic disconnected listener");
    });

    const first = await connect();
    expect(first.response.status).toBe(200);
    const initial = await readUntilEvent(first.reader, "heartbeat");
    expect(initial).toContain("retry: 1000");
    expect(initial).toContain('"project":"unassigned"');
    expect(initial).not.toContain("synthetic-home");
    for (const line of initial
      .split("\n")
      .filter((value) => value.startsWith("data: "))) {
      expect(() => assertCleanPayload(JSON.parse(line.slice(6)))).not.toThrow();
    }
    expect(failedListenerCalls).toBe(1);
    expect(service.snapshots().fleet.workers[0].project).toBe("unassigned");

    const startedAt = Date.now();
    await vi.advanceTimersByTimeAsync(heartbeatMs - 1);
    expect(
      serviceEvents.filter((event) => event.type === "heartbeat"),
    ).toHaveLength(0);

    await fixture.writeFleetState({ revision: 2, fail: false });
    const updatedWorker = nextEvent(
      service,
      "fleet",
      (event) => event.data.workers[0]?.taskPart === "synthetic live update 2",
    );
    const streamedHeartbeat = readUntilEvent(first.reader, "heartbeat");
    await vi.advanceTimersByTimeAsync(1);
    const heartbeatText = await streamedHeartbeat;
    const heartbeatData = heartbeatText
      .split("\n")
      .find((line) => line.startsWith("data: "));
    expect(heartbeatData).toBeDefined();
    expect(JSON.parse(heartbeatData!.slice(6))).toEqual({
      generatedAt: startedAt + heartbeatMs,
    });
    expect((await updatedWorker).data.workers[0].stale).toBe(false);

    first.controller.abort();
    await fixture.writeFleetState({ revision: 2, fail: true });
    const staleFleet = nextEvent(
      service,
      "fleet",
      (event) => event.data.source.status === "stale",
    );
    await vi.advanceTimersByTimeAsync(heartbeatMs);
    expect((await staleFleet).data.workers[0].stale).toBe(true);

    await fixture.writeFleetState({ revision: 3, fail: false });
    const recoveredFleet = nextEvent(
      service,
      "fleet",
      (event) => event.data.workers[0]?.taskPart === "synthetic live update 3",
    );
    await vi.advanceTimersByTimeAsync(heartbeatMs);
    expect((await recoveredFleet).data).toMatchObject({
      source: { status: "live" },
      workers: [{ stale: false }],
    });

    await fixture.writeQuotaState({ percentRemaining: 53 });
    const updatedQuota = nextEvent(
      service,
      "quota",
      (event) => event.data.providers[0]?.windows[0]?.percentRemaining === 53,
    );
    await vi.advanceTimersByTimeAsync(heartbeatMs);
    expect(
      (await updatedQuota).data.providers[0].windows[0].percentRemaining,
    ).toBe(53);

    const reconnected = await connect();
    expect(reconnected.response.status).toBe(200);
    const recoveredInitial = await readUntilEvent(
      reconnected.reader,
      "heartbeat",
    );
    expect(recoveredInitial).toContain("synthetic live update 3");
    expect(recoveredInitial).toContain('"percentRemaining":53');
    expect(recoveredInitial).not.toContain("synthetic-home");
    await reconnected.reader.cancel();

    await vi.advanceTimersByTimeAsync(heartbeatMs);
    expect(
      serviceEvents.filter((event) => event.type === "heartbeat"),
    ).toHaveLength(5);
  }, 15_000);
});
