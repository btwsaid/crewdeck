import type {
  FleetHome,
  FleetSnapshot,
  Worker,
  WorkerStatus,
} from "./contracts";
import type { SafeMetaEnrichment } from "./meta-parser";
import { runtimeFamily, workerKind } from "./meta-parser";
import {
  isRecord,
  safeDisplayToken,
  safeIdentifier,
  safeNarrative,
  safeTimestamp,
} from "./safety";
import { nextMilestone, reconcileStatus } from "./status";

export type FleetEnrichment = ReadonlyMap<string, SafeMetaEnrichment>;

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function enrichmentKey(homeId: string, taskId: string): string {
  return `${homeId}\u0000${taskId}`;
}

function parsePr(value: unknown): Worker["pr"] {
  if (!isRecord(value) || typeof value.url !== "string") return null;
  const match = /\/pull\/(\d+)(?:$|[/?#])/u.exec(value.url);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0
    ? { number, state: "unknown" }
    : null;
}

function lastEvent(task: Record<string, unknown>): {
  state: unknown;
  text: string;
} {
  const paths = isRecord(task.paths) ? task.paths : {};
  const statusLog = isRecord(paths.status_log) ? paths.status_log : {};
  const event = isRecord(statusLog.last_event) ? statusLog.last_event : {};
  return {
    state: event.state,
    text: safeNarrative(event.note, "No meaningful update reported yet"),
  };
}

function mainWorker(
  task: Record<string, unknown>,
  enrichment: FleetEnrichment,
  now: number,
): Worker | null {
  const id = safeIdentifier(task.id, "");
  if (!id) return null;
  const meta = enrichment.get(enrichmentKey("primary", id));
  const current = isRecord(task.current_state) ? task.current_state : {};
  const hints = isRecord(task.hints) ? task.hints : {};
  const event = lastEvent(task);
  const reconciled = reconcileStatus(
    current.state,
    hints.open_decisions,
    event.state,
  );
  const taskPart = safeNarrative(
    current.detail,
    safeNarrative(isRecord(task.backlog) ? task.backlog.title : null, id, 140),
    160,
  );
  const endedAt =
    reconciled.status === "done" ? (meta?.updatedAt ?? now) : null;
  return {
    id,
    homeId: "primary",
    project: meta?.project ?? safeDisplayToken(task.project, "unassigned", 80),
    taskPart,
    kind: meta?.kind ?? workerKind(task.kind),
    runtime: meta?.runtime ?? runtimeFamily(task.harness),
    model: meta?.model ?? "not reported",
    effort: meta?.effort ?? "unknown",
    status: reconciled.status,
    startedAt: meta?.startedAt ?? null,
    endedAt,
    elapsedBasis: meta?.startedAt ? "task-record" : "unavailable",
    phase: {
      label: taskPart,
      total: 1,
      current: reconciled.status === "done" ? 1 : 1,
    },
    last: {
      at: meta?.updatedAt ?? safeTimestamp(current.observed_at),
      text: event.text,
    },
    next: nextMilestone(reconciled.status),
    pr: parsePr(task.pr),
    ci: parsePr(task.pr)
      ? { state: "unknown", label: "not reported locally" }
      : null,
    blocker: reconciled.blocker,
    decision: reconciled.decision,
    stale: false,
  };
}

function statusEvidence(
  taskId: string,
  state: unknown,
  active: Record<string, unknown>[],
  decisions: Record<string, unknown>[],
  holds: Record<string, unknown>[],
): {
  status: WorkerStatus;
  detail: string;
  blocker: string | null;
  decision: string | null;
} {
  const taskActive = active.find((row) => row.id === taskId);
  const taskDecisions = decisions.filter((row) => row.id === taskId);
  const taskHolds = holds.filter((row) => row.id === taskId);
  const reconciled = reconcileStatus(taskActive?.state ?? state, [
    ...taskDecisions,
    ...taskHolds.map((row) => ({ verb: "blocked", summary: row.reason })),
  ]);
  const detail = safeNarrative(
    taskActive?.doing ?? taskDecisions[0]?.summary ?? taskHolds[0]?.reason,
    "No task-part detail reported by this home",
    160,
  );
  return { ...reconciled, detail };
}

function secondmateWorkers(
  mate: Record<string, unknown>,
  homeId: string,
  enrichment: FleetEnrichment,
  now: number,
  stale: boolean,
): Worker[] {
  const active = recordArray(mate.active_children);
  const decisions = recordArray(mate.decisions_open);
  const holds = recordArray(mate.holds);
  return recordArray(mate.endpoints).flatMap((endpoint): Worker[] => {
    const id = safeIdentifier(endpoint.id, "");
    if (!id) return [];
    const evidence = statusEvidence(
      id,
      endpoint.state,
      active,
      decisions,
      holds,
    );
    const meta = enrichment.get(enrichmentKey(homeId, id));
    const endedAt =
      evidence.status === "done" ? (meta?.updatedAt ?? now) : null;
    return [
      {
        id,
        homeId,
        project: meta?.project ?? "not reported",
        taskPart: evidence.detail,
        kind:
          meta?.kind ?? workerKind(active.find((row) => row.id === id)?.kind),
        runtime: meta?.runtime ?? "unknown",
        model: meta?.model ?? "not reported",
        effort: meta?.effort ?? "unknown",
        status: evidence.status,
        startedAt: meta?.startedAt ?? null,
        endedAt,
        elapsedBasis: meta?.startedAt ? "task-record" : "unavailable",
        phase: { label: evidence.detail, total: 1, current: 1 },
        last: {
          at:
            meta?.updatedAt ??
            safeTimestamp(
              isRecord(mate.freshness) ? mate.freshness.observed_at : null,
            ),
          text: evidence.detail,
        },
        next: nextMilestone(evidence.status),
        pr: null,
        ci: null,
        blocker: evidence.blocker,
        decision: evidence.decision,
        stale,
      },
    ];
  });
}

export function mapFleetPayload(
  raw: unknown,
  enrichment: FleetEnrichment = new Map(),
  now = Date.now(),
): FleetSnapshot {
  if (!isRecord(raw) || raw.schema !== "fm-fleet-snapshot.v1") {
    return {
      generatedAt: now,
      source: {
        status: "error",
        refreshedAt: null,
        reason: "Firstmate fleet source returned an unsupported snapshot",
      },
      homes: [
        {
          id: "primary",
          label: "Primary home",
          kind: "primary",
          availability: "stale",
          reason: "source unavailable",
          lastSeenAt: null,
        },
      ],
      workers: [],
    };
  }

  const refreshedAt = safeTimestamp(raw.generated) ?? now;
  const sourceStale = now - refreshedAt > 120_000;
  const homes: FleetHome[] = [
    {
      id: "primary",
      label: "Primary home",
      kind: "primary",
      availability: sourceStale ? "stale" : "live",
      reason: sourceStale
        ? "no fresh fleet observation for more than two minutes"
        : null,
      lastSeenAt: refreshedAt,
    },
  ];
  const workers = recordArray(raw.tasks).flatMap((task) => {
    const worker = mainWorker(task, enrichment, now);
    return worker ? [worker] : [];
  });

  let partial = false;
  const secondmateCurrent = isRecord(raw.secondmate_current)
    ? raw.secondmate_current
    : {};
  for (const mate of recordArray(secondmateCurrent.records)) {
    const alias = safeIdentifier(mate.id, "unknown-mate");
    const homeId = `secondmate:${alias}`;
    const current = isRecord(mate.current) ? mate.current : {};
    const freshness = isRecord(mate.freshness) ? mate.freshness : {};
    const isUnknown = current.state === "unknown";
    const reason = isUnknown
      ? safeNarrative(
          current.reason,
          "registered second mate is unreachable",
          180,
        )
      : null;
    const availability = isUnknown
      ? "unreachable"
      : mate.contradiction === true
        ? "partial"
        : sourceStale
          ? "stale"
          : "live";
    partial ||= availability === "unreachable" || availability === "partial";
    homes.push({
      id: homeId,
      label: `Second mate · ${safeDisplayToken(alias, "unknown", 60)}`,
      kind: "secondmate",
      availability,
      reason,
      lastSeenAt: safeTimestamp(freshness.observed_at),
    });
    workers.push(
      ...secondmateWorkers(
        mate,
        homeId,
        enrichment,
        now,
        availability !== "live",
      ),
    );
  }

  return {
    generatedAt: now,
    source: {
      status: partial ? "partial" : sourceStale ? "stale" : "live",
      refreshedAt,
      reason: partial
        ? "one or more registered second-mate homes are unavailable or partial"
        : sourceStale
          ? "fleet source is stale"
          : null,
    },
    homes,
    workers,
  };
}

export function fleetExecutionError(
  reason: string,
  previous?: FleetSnapshot,
  now = Date.now(),
): FleetSnapshot {
  if (previous) {
    return {
      ...previous,
      generatedAt: now,
      source: {
        status: "stale",
        refreshedAt: previous.source.refreshedAt,
        reason: safeNarrative(reason, "fleet source failed", 180),
      },
      homes: previous.homes.map((home) => ({
        ...home,
        availability: "stale",
        reason: home.reason ?? "source refresh failed",
      })),
      workers: previous.workers.map((worker) => ({ ...worker, stale: true })),
    };
  }
  return mapFleetPayload(null, new Map(), now);
}
