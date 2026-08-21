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
    error: "authoritative local quota source returned an error",
    unsupported: "quota source is unsupported",
  };
  return raw === undefined || raw === null
    ? fallbacks[status]
    : safeNarrative(raw, fallbacks[status] ?? "quota source error", 180);
}

function mapProvider(value: unknown): ProviderQuota | null {
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
  const limitingWindowIds = Array.isArray(value.effective)
    ? value.effective
        .flatMap((entry) =>
          isRecord(entry) && Array.isArray(entry.limitingWindowIds)
            ? entry.limitingWindowIds
            : [],
        )
        .map((id) => safeIdentifier(id, ""))
        .filter(Boolean)
    : [];
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
    reason: errorReason(state, status),
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
        .map(mapProvider)
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
