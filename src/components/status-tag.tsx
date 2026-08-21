import type { WorkerStatus } from "@/server/contracts";
import { Pennant } from "./icons";

export const statusLabels: Record<WorkerStatus, string> = {
  blocked: "blocked",
  "needs-decision": "needs decision",
  review: "in review",
  working: "working",
  paused: "paused",
  done: "done",
  unknown: "unknown",
};

export function StatusTag({ status }: { status: WorkerStatus }) {
  return (
    <span className={`status-tag ${status}`}>
      <Pennant status={status} />
      {statusLabels[status]}
    </span>
  );
}
