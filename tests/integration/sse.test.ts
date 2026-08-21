import { afterEach, describe, expect, it } from "vitest";
import { assertCleanPayload } from "@/server/safety";

async function openInitialStream() {
  const controller = new AbortController();
  const { GET } = await import("@/app/api/stream/route");
  const response = await GET(
    new Request("http://127.0.0.1:4317/api/stream", {
      signal: controller.signal,
    }),
  );
  expect(response.headers.get("content-type")).toContain("text/event-stream");
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (!text.includes("event: heartbeat")) {
    const chunk = await reader.read();
    if (chunk.done) break;
    text += decoder.decode(chunk.value);
  }
  controller.abort();
  return text;
}

afterEach(() => {
  globalThis.__crewdeckService?.close();
  globalThis.__crewdeckService = undefined;
});

describe("SSE snapshots and reconnect", () => {
  it("sends clean initial snapshots and repeats them on reconnect", async () => {
    process.env.CREWDECK_DEMO = "1";
    const first = await openInitialStream();
    expect(first).toContain("event: fleet");
    expect(first).toContain("event: quota");
    expect(first).toContain("event: accounts");
    expect(first).toContain("event: heartbeat");
    const dataLines = first
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as unknown);
    for (const payload of dataLines)
      expect(() => assertCleanPayload(payload)).not.toThrow();

    const reconnected = await openInitialStream();
    expect(reconnected).toContain("retry: 1000");
    expect(reconnected).toContain("event: fleet");
  });
});
