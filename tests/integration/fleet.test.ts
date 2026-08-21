import { describe, expect, it } from "vitest";
import { fleetExecutionError, mapFleetPayload } from "@/server/fleet-parser";
import { assertCleanPayload } from "@/server/safety";

const now = Date.parse("2035-01-01T00:02:00.000Z");
const generated = "2035-01-01T00:01:59.000Z";
const hiddenEmail = ["captain", "example.invalid"].join("@");
const hiddenPath = ["", "home", "synthetic-user", "worktree"].join("/");

function fixture() {
  return {
    schema: "fm-fleet-snapshot.v1",
    generated,
    fm_home: hiddenPath,
    roots: { state: hiddenPath },
    tasks: [
      {
        id: "primary-worker",
        kind: "ship",
        harness: "pi",
        project: "harbor",
        current_state: {
          state: "working",
          detail: "building the synthetic allowlist",
          observed_at: generated,
        },
        hints: { open_decisions: [], username: hiddenEmail },
        paths: {
          status_log: {
            path: hiddenPath,
            last_event: {
              state: "working",
              note: "allowlist tests are green",
              raw: `working at ${hiddenPath}`,
            },
          },
        },
        pr: { url: "https://forge.invalid/example/harbor/pull/42" },
        prompt: "excluded",
      },
    ],
    secondmate_current: {
      records: [
        {
          id: "atoll",
          home: hiddenPath,
          remote: false,
          registered: true,
          current: { state: "active_child_work", reason: null },
          freshness: { observed_at: generated },
          active_children: [
            {
              id: "remote-worker",
              kind: "ship",
              state: "working",
              doing: "running a synthetic dedupe pass",
            },
          ],
          decisions_open: [],
          holds: [],
          endpoints: [
            {
              id: "remote-worker",
              state: "working",
              endpoint: { target: "private-pane" },
            },
          ],
          contradiction: false,
          terminal_evidence: { output: "excluded" },
        },
      ],
    },
  };
}

describe("fleet allowlist integration", () => {
  it("maps multiple homes while excluding hostile raw fields and local locations", () => {
    const result = mapFleetPayload(fixture(), new Map(), now);
    expect(result.homes.map((home) => home.label)).toEqual([
      "Primary home",
      "Second mate · atoll",
    ]);
    expect(result.workers.map((worker) => worker.id)).toEqual([
      "primary-worker",
      "remote-worker",
    ]);
    expect(result.workers[0]).toMatchObject({
      runtime: "pi",
      model: "not reported",
      status: "working",
      pr: { number: 42, state: "unknown" },
    });
    expect(() => assertCleanPayload(result)).not.toThrow();
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain(hiddenEmail);
    expect(serialized).not.toContain(hiddenPath);
    expect(serialized).not.toContain("private-pane");
    expect(serialized).not.toContain("prompt");
  });

  it("retains a last-good snapshot as explicitly stale after source failure", () => {
    const live = mapFleetPayload(fixture(), new Map(), now);
    const failed = fleetExecutionError(
      "synthetic collector failed",
      live,
      now + 5_000,
    );
    expect(failed.source.status).toBe("stale");
    expect(failed.workers.every((worker) => worker.stale)).toBe(true);
    expect(failed.workers).toHaveLength(2);
  });

  it("marks malformed local records unknown rather than silently dropping membership", () => {
    const raw = fixture();
    raw.tasks[0].current_state = {
      state: "new-upstream-state",
      detail: "",
      observed_at: generated,
    };
    raw.tasks[0].hints = { open_decisions: [], username: hiddenEmail };
    raw.tasks[0].paths.status_log.last_event.state = "new-upstream-state";
    const result = mapFleetPayload(raw, new Map(), now);
    expect(result.workers[0].status).toBe("unknown");
    expect(result.workers[0].next).toContain("recover authoritative");
  });

  it("marks old generated observations stale and recovers on a fresh snapshot", () => {
    const old = fixture();
    old.generated = "2034-12-31T23:00:00.000Z";
    expect(mapFleetPayload(old, new Map(), now).source.status).toBe("stale");
    expect(mapFleetPayload(fixture(), new Map(), now).source.status).toBe(
      "live",
    );
  });
});
