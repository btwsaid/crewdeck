import type {
  PaceState,
  ProviderQuota,
  QuotaSnapshot,
  QuotaState,
  QuotaWindow,
} from "./contracts";
import {
  isRecord,
  safeBoundedNumber,
  safeDisplayToken,
  safeIdentifier,
  safeNarrative,
  safeTimestamp,
} from "./safety";

function paceState(value: unknown): PaceState {
  return value === "ahead" || value === "behind" || value === "on_pace"
    ? value
    : "unknown";
}

function quotaState(value: unknown, stale: unknown): QuotaState {
  if (
    stale === true &&
    (value === "fresh" || value === "ok" || value === "available")
  )
    return "stale";
  switch (value) {
    case "fresh":
    case "ok":
    case "available":
      return "fresh";
    case "stale":
      return "stale";
    case "auth_required":
      return "auth_required";
    case "rate_limited":
      return "rate_limited";
    case "unsupported":
      return "unsupported";
    case "unavailable":
      return "unavailable";
    default:
      return "error";
  }
}

function mapWindow(value: unknown): QuotaWindow | null {
  if (!isRecord(value)) return null;
  const id = safeIdentifier(value.id, "");
  if (!id) return null;
  const pace = isRecord(value.pace) ? value.pace : {};
  const percentRemaining =
    value.percentRemaining === null
      ? null
      : safeBoundedNumber(value.percentRemaining, 0, 100);
  return {
    id,
    label: safeDisplayToken(value.label, id, 80),
    kind: safeDisplayToken(value.kind, "unreported", 40),
    percentRemaining,
    resetsAt: safeTimestamp(value.resetsAt),
    windowSeconds: safeBoundedNumber(
      value.windowSeconds,
      1,
      366 * 24 * 60 * 60,
    ),
    elapsedPercent: safeBoundedNumber(pace.elapsedPercent, 0, 100),
    pace: {
      status: paceState(pace.status),
      burnMultiple: safeBoundedNumber(pace.burnMultiple, 0, 1_000),
      projectedExhaustedAt: safeTimestamp(pace.projectedExhaustedAt),
      projectionConfidence:
        pace.projectionConfidence === null
          ? null
          : safeDisplayToken(pace.projectionConfidence, "unknown", 32),
    },
  };
}

function errorReason(
  state: Record<string, unknown>,
  status: QuotaState,
): string | null {
  const raw = isRecord(state.error)
    ? (state.error.message ?? state.error.code)
    : (state.error ?? state.authStatus);
  const fallbacks: Record<QuotaState, string | null> = {
    fresh: null,
    stale: "last authoritative values are stale",
    unavailable: "authoritative local quota source is unavailable",
    auth_required: "authentication required in the official provider CLI",
    rate_limited: "authoritative local quota source is rate limited",
    error: "authoritative local quota source returned an error",
    unsupported: "quota source is unsupported",
  };
  return raw === undefined || raw === null
    ? fallbacks[status]
    : safeNarrative(raw, fallbacks[status] ?? "quota source error", 180);
}

function mapProvider(value: unknown, now: number): ProviderQuota | null {
  if (!isRecord(value)) return null;
  const provider = safeIdentifier(value.provider, "");
  if (!provider) return null;
  const state = isRecord(value.state) ? value.state : {};
  const status = quotaState(state.status, state.stale);
  const windows = Array.isArray(value.windows)
    ? value.windows
        .map(mapWindow)
        .filter((window): window is QuotaWindow => window !== null)
    : [];
  const quotaSemantics = isRecord(value.quotaSemantics)
    ? value.quotaSemantics
    : {};
  const effectiveAvailability = Array.isArray(
    quotaSemantics.effectiveAvailability,
  )
    ? quotaSemantics.effectiveAvailability
    : Array.isArray(value.effective)
      ? value.effective
      : [];
  const reportedWindowIds = new Set(windows.map((window) => window.id));
  const limitingWindowIds = [
    ...new Set(
      effectiveAvailability
        .flatMap((entry) =>
          isRecord(entry) && Array.isArray(entry.limitingWindowIds)
            ? entry.limitingWindowIds
            : [],
        )
        .map((id) => safeIdentifier(id, ""))
        .filter((id) => id && reportedWindowIds.has(id)),
    ),
  ];
  const reason = errorReason(state, status);
  const queryFailed =
    ["rate_limited", "unavailable", "error"].includes(status) ||
    (status === "stale" && state.error !== undefined);
  return {
    provider,
    label: safeDisplayToken(value.label, provider, 50),
    accountAlias: null,
    plan:
      value.plan === null
        ? null
        : safeDisplayToken(value.plan, "not reported", 40),
    sourceKind: safeDisplayToken(value.source, "unavailable", 40),
    state: { status, refreshedAt: safeTimestamp(state.refreshedAt) },
    windows,
    reason,
    queryError: queryFailed && reason ? { observedAt: now, reason } : null,
    limitingWindowIds,
    relationship: "unknown",
  };
}

export function parseQuotaPayload(
  raw: unknown,
  now = Date.now(),
): QuotaSnapshot {
  if (!isRecord(raw) || raw.schemaVersion !== 3) {
    const received =
      isRecord(raw) && typeof raw.schemaVersion === "number"
        ? raw.schemaVersion
        : null;
    return {
      generatedAt: now,
      schemaVersion: received,
      source: {
        status: "unsupported",
        refreshedAt: null,
        reason: `unsupported quota source schema — expected version 3${received === null ? "" : `, received ${received}`}`,
      },
      providers: [],
    };
  }

  const providers = Array.isArray(raw.providers)
    ? raw.providers
        .map((provider) => mapProvider(provider, now))
        .filter((provider): provider is ProviderQuota => provider !== null)
    : [];
  const refreshedAt = safeTimestamp(raw.generatedAt) ?? now;
  const stale = providers.some((provider) => provider.state.status === "stale");
  const failures = providers.filter(
    (provider) => !["fresh", "stale"].includes(provider.state.status),
  );
  const successful = providers.length - failures.length;
  const sourceStatus =
    providers.length === 0 || successful === 0
      ? "error"
      : failures.length > 0
        ? "partial"
        : stale
          ? "stale"
          : "live";
  return {
    generatedAt: now,
    schemaVersion: 3,
    source: {
      status: sourceStatus,
      refreshedAt,
      reason:
        sourceStatus === "partial"
          ? `${successful} of ${providers.length} providers reporting`
          : sourceStatus === "error"
            ? "no authoritative quota provider is reporting"
            : stale
              ? "authoritative quota values are stale"
              : null,
    },
    providers,
  };
}

const fiveHoursMs = 5 * 60 * 60 * 1_000;
const sevenDaysMs = 7 * 24 * 60 * 60 * 1_000;
const transientClaudeStates: QuotaState[] = [
  "rate_limited",
  "unavailable",
  "error",
];

function retainableClaudeWindows(
  provider: ProviderQuota,
  now: number,
): QuotaWindow[] {
  const refreshedAt = provider.state.refreshedAt;
  if (
    !["fresh", "stale"].includes(provider.state.status) ||
    refreshedAt === null ||
    refreshedAt > now ||
    now - refreshedAt >= sevenDaysMs
  ) {
    return [];
  }
  const age = now - refreshedAt;
  return provider.windows
    .filter((window) => {
      if (window.resetsAt !== null) return window.resetsAt > now;
      if (window.kind === "weekly" || window.kind === "model")
        return age < sevenDaysMs;
      if (window.kind === "session") return age < fiveHoursMs;
      return false;
    })
    .map((window) => ({
      ...window,
      elapsedPercent: null,
      pace: {
        status: "unknown" as const,
        burnMultiple: null,
        projectedExhaustedAt: null,
        projectionConfidence: null,
      },
    }));
}

function summarizeReconciledSource(snapshot: QuotaSnapshot): QuotaSnapshot {
  if (snapshot.source.status === "unsupported") return snapshot;
  const reporting = snapshot.providers.filter((provider) =>
    ["fresh", "stale"].includes(provider.state.status),
  );
  const stale = reporting.filter(
    (provider) => provider.state.status === "stale",
  ).length;
  const failures = snapshot.providers.length - reporting.length;
  const status =
    reporting.length === 0
      ? "error"
      : failures > 0
        ? "partial"
        : stale > 0
          ? "stale"
          : "live";
  return {
    ...snapshot,
    source: {
      ...snapshot.source,
      status,
      reason:
        status === "partial"
          ? `${reporting.length} of ${snapshot.providers.length} providers reporting${stale > 0 ? `; ${stale} retained stale` : ""}`
          : status === "stale"
            ? "authoritative quota values are stale"
            : status === "live"
              ? null
              : snapshot.source.reason,
    },
  };
}

export function retainLastGoodClaude(
  next: QuotaSnapshot,
  previous: QuotaSnapshot,
  now = Date.now(),
): QuotaSnapshot {
  if (next.source.status === "unsupported") return next;
  const currentIndex = next.providers.findIndex(
    (provider) => provider.provider === "claude",
  );
  const current = next.providers[currentIndex];
  const transientFailure = current
    ? transientClaudeStates.includes(current.state.status) &&
      current.windows.length === 0
    : next.source.status === "error";
  if (!transientFailure) return next;

  const lastGood = previous.providers.find(
    (provider) => provider.provider === "claude",
  );
  if (!lastGood) return next;
  const windows = retainableClaudeWindows(lastGood, now);
  if (windows.length === 0) return next;

  const queryReason =
    current?.queryError?.reason ??
    current?.reason ??
    next.source.reason ??
    "latest quota source query failed";
  const retained: ProviderQuota = {
    ...lastGood,
    state: { status: "stale", refreshedAt: lastGood.state.refreshedAt },
    windows,
    reason:
      "Last authoritative Claude allowance is retained while the latest source query is unavailable.",
    queryError: { observedAt: now, reason: queryReason },
    limitingWindowIds: [],
    relationship: "unknown",
  };
  const providers = [...next.providers];
  if (currentIndex >= 0) providers[currentIndex] = retained;
  else providers.push(retained);
  return summarizeReconciledSource({ ...next, providers });
}

export function quotaExecutionError(
  reason: string,
  now = Date.now(),
): QuotaSnapshot {
  return {
    generatedAt: now,
    schemaVersion: null,
    source: {
      status: "error",
      refreshedAt: null,
      reason: safeNarrative(reason, "quota source failed", 180),
    },
    providers: [],
  };
}
