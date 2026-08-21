import type { Effort, RuntimeFamily, WorkerKind } from "./contracts";
import { safeDisplayToken } from "./safety";

export interface SafeMetaEnrichment {
  project: string;
  kind: WorkerKind;
  runtime: RuntimeFamily;
  model: string;
  effort: Effort;
  startedAt: number | null;
  updatedAt: number | null;
}

const runtimes: RuntimeFamily[] = [
  "claude",
  "codex",
  "opencode",
  "pi",
  "pi-signed",
  "grok",
  "kimi",
  "cursor",
  "muse",
];
const efforts: Effort[] = ["low", "medium", "high", "xhigh", "max"];

export function runtimeFamily(value: unknown): RuntimeFamily {
  if (typeof value !== "string") return "unknown";
  const lower = value.trim().toLowerCase();
  if (lower.startsWith("pi-signed")) return "pi-signed";
  return (
    runtimes.find(
      (runtime) => lower === runtime || lower.startsWith(`${runtime}-`),
    ) ?? "unknown"
  );
}

export function workerKind(value: unknown): WorkerKind {
  if (value === "scout") return "scout";
  if (value === "secondmate") return "secondmate";
  return "crewmate";
}

export function parseMetaAllowlist(
  raw: string,
  times: { startedAt?: number | null; updatedAt?: number | null } = {},
): SafeMetaEnrichment {
  const selected: Record<string, string> = {};
  for (const line of raw.slice(0, 64 * 1024).split(/\r?\n/u)) {
    const separator = line.indexOf("=");
    if (separator <= 0) continue;
    const key = line.slice(0, separator);
    if (
      !["project", "kind", "harness", "model", "effort"].includes(key) ||
      selected[key] !== undefined
    )
      continue;
    selected[key] = line.slice(separator + 1);
  }

  const effort = efforts.includes(selected.effort as Effort)
    ? (selected.effort as Effort)
    : "unknown";
  return {
    project: safeDisplayToken(selected.project, "unassigned", 80),
    kind: workerKind(selected.kind),
    runtime: runtimeFamily(selected.harness),
    model: safeDisplayToken(selected.model, "not reported", 100),
    effort,
    startedAt: times.startedAt ?? null,
    updatedAt: times.updatedAt ?? null,
  };
}
