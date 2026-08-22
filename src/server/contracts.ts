export type WorkerStatus =
  | "blocked"
  | "needs-decision"
  | "review"
  | "working"
  | "paused"
  | "done"
  | "unknown";

export type RuntimeFamily =
  | "claude"
  | "codex"
  | "opencode"
  | "pi"
  | "pi-signed"
  | "grok"
  | "kimi"
  | "cursor"
  | "muse"
  | "unknown";

export type WorkerKind = "crewmate" | "scout" | "secondmate";
export type Effort = "low" | "medium" | "high" | "xhigh" | "max" | "unknown";

export interface Worker {
  id: string;
  homeId: string;
  project: string;
  taskPart: string;
  kind: WorkerKind;
  runtime: RuntimeFamily;
  model: string;
  effort: Effort;
  status: WorkerStatus;
  startedAt: number | null;
  endedAt: number | null;
  elapsedBasis: "task-record" | "observed" | "unavailable";
  phase: { label: string; total: number; current: number };
  last: { at: number | null; text: string };
  next: string;
  pr: {
    number: number;
    state: "open" | "merged" | "closed" | "unknown";
  } | null;
  ci: { state: "pass" | "fail" | "running" | "unknown"; label: string } | null;
  blocker: string | null;
  decision: string | null;
  stale: boolean;
}

export interface FleetHome {
  id: string;
  label: string;
  kind: "primary" | "secondmate";
  availability: "live" | "stale" | "unreachable" | "partial";
  reason: string | null;
  lastSeenAt: number | null;
}

export interface FleetSnapshot {
  generatedAt: number;
  source: {
    status: "loading" | "live" | "stale" | "partial" | "error";
    refreshedAt: number | null;
    reason: string | null;
  };
  homes: FleetHome[];
  workers: Worker[];
}

export type QuotaState =
  | "fresh"
  | "stale"
  | "unavailable"
  | "auth_required"
  | "rate_limited"
  | "error"
  | "unsupported";

export type PaceState = "ahead" | "behind" | "on_pace" | "unknown";

export interface QuotaWindow {
  id: string;
  label: string;
  kind: string;
  percentRemaining: number | null;
  resetsAt: number | null;
  windowSeconds: number | null;
  elapsedPercent: number | null;
  pace: {
    status: PaceState;
    burnMultiple: number | null;
    projectedExhaustedAt: number | null;
    projectionConfidence: string | null;
  };
}

export interface ProviderQuota {
  provider: string;
  label: string;
  accountAlias: string | null;
  plan: string | null;
  sourceKind: string;
  state: { status: QuotaState; refreshedAt: number | null };
  windows: QuotaWindow[];
  reason: string | null;
  queryError: { observedAt: number; reason: string } | null;
  limitingWindowIds: string[];
  relationship: "comparable" | "incomparable" | "unknown";
}

export interface QuotaSnapshot {
  generatedAt: number;
  schemaVersion: number | null;
  source: {
    status: "loading" | "live" | "stale" | "partial" | "error" | "unsupported";
    refreshedAt: number | null;
    reason: string | null;
  };
  providers: ProviderQuota[];
}

export interface AccountRegistration {
  alias: string;
  sourceId: string;
}

export interface DetectedProfile {
  provider: "claude" | "codex";
  sourceId: string;
  plan: string | null;
  state: QuotaState;
}

export interface AccountView extends AccountRegistration {
  provider: "claude" | "codex";
  plan: string | null;
  state: { status: QuotaState; refreshedAt: number | null };
  windows: QuotaWindow[];
  note: string | null;
  queryError: { observedAt: number; reason: string } | null;
}

export interface AccountsSnapshot {
  generatedAt: number;
  detection: {
    status: "ready" | "unsupported" | "error";
    reason: string | null;
  };
  accounts: AccountView[];
  detected: DetectedProfile[];
}

export type StreamEvent =
  | { type: "fleet"; data: FleetSnapshot }
  | { type: "quota"; data: QuotaSnapshot }
  | { type: "accounts"; data: AccountsSnapshot }
  | { type: "heartbeat"; data: { generatedAt: number } };
