import type {
  AccountRegistration,
  AccountsSnapshot,
  AccountView,
  DetectedProfile,
  QuotaSnapshot,
} from "./contracts";
import { providerFromSourceId } from "./account-registry";

export function buildAccountsSnapshot(
  registrations: AccountRegistration[],
  _quota: QuotaSnapshot,
  detected: DetectedProfile[],
  detectionReason: string | null,
  now = Date.now(),
): AccountsSnapshot {
  const accountViews: AccountView[] = registrations.map((registration) => ({
    ...registration,
    provider: providerFromSourceId(registration.sourceId),
    plan: null,
    state: { status: "unavailable", refreshedAt: null },
    windows: [],
    note: "per-profile windows are not reported by the authoritative safe local source; provider totals are not assigned to an alias",
    queryError: null,
  }));
  return {
    generatedAt: now,
    detection: {
      status: detectionReason ? "unsupported" : "ready",
      reason: detectionReason,
    },
    accounts: accountViews,
    detected: detected.filter(
      (candidate) =>
        !registrations.some(
          (registration) => registration.sourceId === candidate.sourceId,
        ),
    ),
  };
}

export function comparableWindows(accounts: AccountView[]):
  | { comparable: false; best: [] }
  | {
      comparable: true;
      best: {
        id: string;
        label: string;
        percentRemaining: number;
        alias: string;
        refreshedAt: number | null;
        state: AccountView["state"]["status"];
        queryError: AccountView["queryError"];
      }[];
    } {
  const reporting = accounts.filter((account) =>
    ["fresh", "stale"].includes(account.state.status),
  );
  if (reporting.length < 2) return { comparable: false, best: [] };
  const signatures = reporting.map((account) =>
    account.windows
      .map((window) => window.id)
      .sort()
      .join("|"),
  );
  if (
    !signatures[0] ||
    !signatures.every((signature) => signature === signatures[0])
  ) {
    return { comparable: false, best: [] };
  }
  const best = reporting[0].windows.flatMap((window) => {
    const options = reporting
      .map((account) => ({
        account,
        window: account.windows.find((candidate) => candidate.id === window.id),
      }))
      .filter(
        (option): option is { account: AccountView; window: typeof window } =>
          option.window?.percentRemaining !== null &&
          option.window?.percentRemaining !== undefined,
      )
      .sort(
        (left, right) =>
          (right.window.percentRemaining ?? -1) -
          (left.window.percentRemaining ?? -1),
      );
    const winner = options[0];
    return winner
      ? [
          {
            id: window.id,
            label: window.label,
            percentRemaining: winner.window.percentRemaining as number,
            alias: winner.account.alias,
            refreshedAt: winner.account.state.refreshedAt,
            state: winner.account.state.status,
            queryError: winner.account.queryError,
          },
        ]
      : [];
  });
  return { comparable: true, best };
}
