import type { WorkerStatus } from "./contracts";
import { isRecord, safeNarrative } from "./safety";

const priority: WorkerStatus[] = [
  "blocked",
  "needs-decision",
  "review",
  "working",
  "paused",
  "done",
  "unknown",
];

function statusFromState(value: unknown): WorkerStatus {
  if (typeof value !== "string") return "unknown";
  switch (value.trim().toLowerCase().replaceAll("_", "-")) {
    case "working":
    case "busy":
    case "active":
      return "working";
    case "blocked":
    case "failed":
      return "blocked";
    case "needs-decision":
    case "captain-decision":
      return "needs-decision";
    case "review":
    case "in-review":
      return "review";
    case "paused":
    case "parked":
    case "idle":
      return "paused";
    case "done":
    case "complete":
    case "completed":
      return "done";
    default:
      return "unknown";
  }
}

export interface StatusReconciliation {
  status: WorkerStatus;
  blocker: string | null;
  decision: string | null;
}

export function reconcileStatus(
  currentState: unknown,
  openDecisions: unknown,
  lastEventState?: unknown,
): StatusReconciliation {
  let blocker: string | null = null;
  let decision: string | null = null;
  if (Array.isArray(openDecisions)) {
    for (const row of openDecisions) {
      if (!isRecord(row)) continue;
      const verb = typeof row.verb === "string" ? row.verb : "";
      const summary = safeNarrative(
        row.summary,
        "Details withheld by privacy filter",
      );
      if (verb === "blocked") blocker ??= summary;
      if (verb === "needs-decision" || verb === "captain-hold")
        decision ??= summary;
    }
  }

  const candidates: WorkerStatus[] = [];
  if (blocker) candidates.push("blocked");
  if (decision) candidates.push("needs-decision");
  candidates.push(
    statusFromState(currentState),
    statusFromState(lastEventState),
  );
  candidates.sort(
    (left, right) => priority.indexOf(left) - priority.indexOf(right),
  );
  return { status: candidates[0] ?? "unknown", blocker, decision };
}

export function nextMilestone(status: WorkerStatus): string {
  switch (status) {
    case "blocked":
      return "resolve the reported blocker";
    case "needs-decision":
      return "captain answers the open decision";
    case "review":
      return "complete review and reconcile findings";
    case "working":
      return "publish the next meaningful status gate";
    case "paused":
      return "resume when the declared wait clears";
    case "done":
      return "no further milestone";
    default:
      return "recover authoritative worker state";
  }
}
