"use client";

import { useCallback, useMemo, useState } from "react";
import type {
  AccountsSnapshot,
  AccountView,
  DetectedProfile,
  QuotaWindow,
} from "@/server/contracts";
import { formatAgo, resetCountdown } from "./format";
import { Pennant, ShieldIcon } from "./icons";
import { SectionCap } from "./section-cap";
import { useDialog } from "./use-dialog";

type Modal =
  | { kind: "add" }
  | { kind: "detected"; profile: DetectedProfile }
  | { kind: "rename"; account: AccountView }
  | { kind: "disconnect"; account: AccountView };

function MiniWindow({ window }: { window: QuotaWindow }) {
  const percentage = window.percentRemaining;
  return (
    <div className="acct-win">
      <span className="w-label">{window.label}</span>
      <span
        className={`gauge-track ${percentage === null ? "unknown hatch" : ""}`}
        role="img"
        aria-label={`${window.label}: ${percentage === null ? "percentage unavailable" : `${percentage} percent remaining`}`}
      >
        {percentage !== null && (
          <span
            className={`gauge-fill ${percentage <= 15 ? "critical" : percentage <= 40 ? "low" : ""}`}
            style={{ width: `${percentage}%` }}
          />
        )}
      </span>
      <span className="w-reset">
        {percentage === null ? "?" : `${percentage}%`} ·{" "}
        {resetCountdown(window.resetsAt)}
      </span>
    </div>
  );
}

function comparable(accounts: AccountView[]) {
  const reporting = accounts.filter((account) =>
    ["fresh", "stale"].includes(account.state.status),
  );
  if (reporting.length < 2) return null;
  const signatures = reporting.map((account) =>
    account.windows
      .map((window) => window.id)
      .sort()
      .join("|"),
  );
  if (
    !signatures[0] ||
    !signatures.every((signature) => signature === signatures[0])
  )
    return false;
  return reporting[0].windows.flatMap((window) => {
    const choices = reporting
      .flatMap((account) => {
        const candidate = account.windows.find((item) => item.id === window.id);
        return candidate?.percentRemaining === null ||
          candidate?.percentRemaining === undefined
          ? []
          : [{ alias: account.alias, percentage: candidate.percentRemaining }];
      })
      .sort((left, right) => right.percentage - left.percentage);
    return choices[0]
      ? [{ id: window.id, label: window.label, ...choices[0] }]
      : [];
  });
}

function ProviderOverview({
  provider,
  accounts,
}: {
  provider: string;
  accounts: AccountView[];
}) {
  const result = comparable(accounts);
  if (result === null) return null;
  if (result === false)
    return (
      <p className="acct-note provider-note">
        No combined {provider} overview: these accounts report different window
        sets, so a merged number would be misleading. Read each account card on
        its own terms.
      </p>
    );
  return (
    <article className="gauge-card provider-overview">
      <div className="gauge-head">
        <span className="gauge-provider">{provider} · all accounts</span>
        <span className="gauge-window">comparable window sets</span>
      </div>
      {result.map((window) => (
        <div className="acct-win" key={window.id}>
          <span className="w-label">{window.label}</span>
          <span
            className="gauge-track"
            role="img"
            aria-label={`best ${window.label}: ${window.percentage} percent, on ${window.alias}`}
          >
            <span
              className="gauge-fill"
              style={{ width: `${window.percentage}%` }}
            />
          </span>
          <span className="w-reset">
            best {window.percentage}% · {window.alias}
          </span>
        </div>
      ))}
      <div className="gauge-foot">
        <span className="gauge-state">
          best remaining per window — not a sum or shared pool
        </span>
      </div>
    </article>
  );
}

function AccountCard({
  account,
  onRename,
  onDisconnect,
  now,
}: {
  account: AccountView;
  onRename: () => void;
  onDisconnect: () => void;
  now: number;
}) {
  const unavailable = [
    "auth_required",
    "rate_limited",
    "error",
    "unsupported",
    "unavailable",
  ].includes(account.state.status);
  return (
    <article className={`acct-card ${unavailable ? "unavailable" : ""}`}>
      <div className="acct-head">
        <span className="acct-alias">{account.alias}</span>
        <span className="acct-provider">{account.provider}</span>
        {account.plan && <span className="acct-plan">{account.plan}</span>}
        <span className="acct-src" title="masked non-secret source identifier">
          {account.sourceId.replace(`${account.provider}:`, "")}
        </span>
      </div>
      {unavailable ? (
        <>
          <div
            className="gauge-track unknown hatch"
            role="img"
            aria-label={`${account.state.status}; no quota data`}
          />
          <p className="acct-note">
            {account.note ?? "authoritative account data unavailable"}
          </p>
          <div className="gauge-foot">
            <span className="gauge-state">
              {account.state.status.replace("_", " ")} · no data
            </span>
          </div>
        </>
      ) : (
        <>
          <div className="acct-windows">
            {account.windows.length > 0 ? (
              account.windows.map((window) => (
                <MiniWindow window={window} key={window.id} />
              ))
            ) : (
              <div className="acct-note">window not reported by source</div>
            )}
          </div>
          <div className="gauge-foot">
            <span
              className={`gauge-state ${account.state.status === "stale" ? "stale" : ""}`}
            >
              {account.state.status} · refreshed{" "}
              {formatAgo(account.state.refreshedAt, now)}
            </span>
          </div>
        </>
      )}
      <div className="acct-foot">
        <button className="ghost-btn" onClick={onRename}>
          Rename alias
        </button>
        <button className="ghost-btn danger" onClick={onDisconnect}>
          Disconnect
        </button>
      </div>
    </article>
  );
}

function AccountModal({
  modal,
  snapshot,
  onClose,
  onDetected,
  onRegister,
  onRename,
  onDisconnect,
}: {
  modal: Modal | null;
  snapshot: AccountsSnapshot;
  onClose: () => void;
  onDetected: (profile: DetectedProfile) => void;
  onRegister: (profile: DetectedProfile, alias: string) => Promise<void>;
  onRename: (account: AccountView, alias: string) => Promise<void>;
  onDisconnect: (account: AccountView) => Promise<void>;
}) {
  const [alias, setAlias] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const close = useCallback(() => onClose(), [onClose]);
  const reference = useDialog<HTMLDivElement>(modal !== null, close);
  if (!modal) return null;
  const detectionNoteId = "profile-detection-note";
  const perform = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      onClose();
    } catch {
      setError(
        "Crewdeck rejected the account change. Check the alias and try again.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <div
      className="modal-scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-modal-title"
        ref={reference}
      >
        {modal.kind === "add" && (
          <>
            <h2 id="account-modal-title">Add account</h2>
            <p>
              Crewdeck does not collect credentials. Authentication stays in the
              official CLI&apos;s own local credential store.
            </p>
            <div className="step">
              <span className="no">1</span>
              <span>
                In a terminal, use the official tool: <code>claude /login</code>{" "}
                or <code>codex login</code>. Nothing is typed into Crewdeck.
              </span>
            </div>
            <div className="step">
              <span className="no">2</span>
              <span>
                Return here and detect profiles reported by the authoritative
                safe local quota source.
              </span>
            </div>
            <div className="step">
              <span className="no">3</span>
              <span>
                Name a detected profile. Crewdeck stores only that alias and its
                masked non-secret source identifier.
              </span>
            </div>
            {snapshot.detection.status !== "ready" ? (
              <div
                className="modal-state detection-note"
                id={detectionNoteId}
                role="note"
                tabIndex={-1}
              >
                <b>Detection unavailable.</b> {snapshot.detection.reason}
                <span>
                  Safe next action: use provider-level windows on Deck, keep
                  aliases separate, and try again only after the safe source
                  reports stable masked profile identifiers.
                </span>
              </div>
            ) : (
              snapshot.detected.length === 0 && (
                <div
                  className="modal-state detection-note"
                  id={detectionNoteId}
                  role="status"
                  tabIndex={-1}
                >
                  No new safely identified profiles are currently reported.
                </div>
              )
            )}
            <div className="actions">
              <button className="ghost-btn" onClick={onClose}>
                Cancel
              </button>
              {snapshot.detected.length > 0 ? (
                <button
                  className="ghost-btn primary"
                  onClick={() => onDetected(snapshot.detected[0])}
                >
                  Detect new profiles
                </button>
              ) : (
                <button
                  className="ghost-btn primary"
                  aria-disabled="true"
                  aria-describedby={detectionNoteId}
                >
                  {snapshot.detection.status === "ready"
                    ? "No new profiles"
                    : "Detection unavailable"}
                </button>
              )}
            </div>
            {snapshot.detected.length > 0 && (
              <div className="detected">
                <Pennant status="working" />
                <span>
                  Ready to detect a {snapshot.detected[0].provider} profile ·{" "}
                  {snapshot.detected[0].sourceId.replace(
                    `${snapshot.detected[0].provider}:`,
                    "",
                  )}
                </span>
              </div>
            )}
            <div className="never">
              Never requested here: passwords · API keys · session cookies ·
              access tokens. If a Crewdeck screen asks for one, refuse it as a
              bug.
            </div>
          </>
        )}
        {modal.kind === "detected" && (
          <>
            <h2 id="account-modal-title">Register detected profile</h2>
            <div className="detected">
              <Pennant status="working" />
              <div>
                New <b>{modal.profile.provider}</b> profile reported by the safe
                local source.
                <br />
                <span className="mono">
                  {modal.profile.sourceId.replace(
                    `${modal.profile.provider}:`,
                    "",
                  )}{" "}
                  · plan {modal.profile.plan ?? "not reported"}
                </span>
              </div>
            </div>
            <label htmlFor="alias-input">
              Alias (the only captain-chosen display label)
            </label>
            <input
              id="alias-input"
              type="text"
              autoComplete="off"
              value={alias}
              maxLength={40}
              onChange={(event) => setAlias(event.target.value)}
            />
            <div className="actions">
              <button className="ghost-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="ghost-btn primary"
                disabled={busy || !alias.trim()}
                onClick={() =>
                  void perform(() => onRegister(modal.profile, alias))
                }
              >
                Register alias
              </button>
            </div>
            <div className="never">
              Registration persists only alias + masked source identifier.
            </div>
          </>
        )}
        {modal.kind === "rename" && (
          <>
            <h2 id="account-modal-title">Rename alias</h2>
            <p>
              Change only the Crewdeck display label for{" "}
              <b>{modal.account.alias}</b>. Authentication and quota source data
              are untouched.
            </p>
            <label htmlFor="alias-input">New alias</label>
            <input
              id="alias-input"
              type="text"
              autoComplete="off"
              value={alias}
              placeholder={modal.account.alias}
              maxLength={40}
              onChange={(event) => setAlias(event.target.value)}
            />
            <div className="actions">
              <button className="ghost-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="ghost-btn primary"
                disabled={busy || !alias.trim()}
                onClick={() =>
                  void perform(() => onRename(modal.account, alias))
                }
              >
                Save alias
              </button>
            </div>
          </>
        )}
        {modal.kind === "disconnect" && (
          <>
            <h2 id="account-modal-title">Disconnect “{modal.account.alias}”</h2>
            <p>
              This removes only the alias and masked source registration from
              Crewdeck. Native CLI credentials are <b>not touched</b>.
            </p>
            <div className="actions">
              <button className="ghost-btn" onClick={onClose}>
                Cancel
              </button>
              <button
                className="ghost-btn danger"
                disabled={busy}
                onClick={() => void perform(() => onDisconnect(modal.account))}
              >
                Disconnect from Crewdeck
              </button>
            </div>
            <div className="never">
              Credential revocation is a separate deliberate action in the
              official CLI: <code>claude /logout</code> or{" "}
              <code>codex logout</code>. Crewdeck never runs it.
            </div>
          </>
        )}
        {error && (
          <div className="modal-state err" role="alert">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}

export function AccountsView({
  snapshot,
  now,
  mutate,
}: {
  snapshot: AccountsSnapshot | null;
  now: number;
  mutate: (
    method: "POST" | "PATCH" | "DELETE",
    body: Record<string, string>,
  ) => Promise<void>;
}) {
  const [modal, setModal] = useState<Modal | null>(null);
  const grouped = useMemo(
    () =>
      (snapshot?.accounts ?? []).reduce<
        Record<"claude" | "codex", AccountView[]>
      >(
        (result, account) => {
          result[account.provider].push(account);
          return result;
        },
        { claude: [], codex: [] },
      ),
    [snapshot],
  );
  const close = useCallback(() => setModal(null), []);
  if (!snapshot)
    return (
      <div className="berths">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="skeleton" key={index} />
        ))}
      </div>
    );
  return (
    <>
      {(["claude", "codex"] as const).map((provider) => {
        const accounts = grouped[provider] ?? [];
        return (
          <section key={provider}>
            <SectionCap
              note={`${accounts.length} registered profile${accounts.length === 1 ? "" : "s"}`}
            >
              {provider}
            </SectionCap>
            <ProviderOverview provider={provider} accounts={accounts} />
            <div className="acct-grid">
              {accounts.map((account) => (
                <AccountCard
                  account={account}
                  now={now}
                  onRename={() => setModal({ kind: "rename", account })}
                  onDisconnect={() => setModal({ kind: "disconnect", account })}
                  key={account.sourceId}
                />
              ))}
              {accounts.length === 0 && (
                <div className="empty-account">
                  No Crewdeck registrations. Quota windows remain visible on
                  Deck when the source reports them.
                </div>
              )}
            </div>
          </section>
        );
      })}
      <div className="account-actions">
        <button
          className="ghost-btn add-account"
          onClick={() => setModal({ kind: "add" })}
        >
          + Add account
        </button>
      </div>
      <div className="privacy-strip">
        <ShieldIcon />
        <div>
          Crewdeck contains no credential input. Official Claude and Codex CLIs
          own authentication; Crewdeck persists only captain-chosen aliases plus
          masked non-secret source identifiers. Disconnect never deletes native
          credentials. Live values remain in memory and every browser request
          stays on loopback.
        </div>
      </div>
      <AccountModal
        key={
          modal
            ? `${modal.kind}:${"account" in modal ? modal.account.sourceId : modal.kind === "detected" ? modal.profile.sourceId : "new"}`
            : "closed"
        }
        modal={modal}
        snapshot={snapshot}
        onClose={close}
        onDetected={(profile) => setModal({ kind: "detected", profile })}
        onRegister={async (profile, alias) =>
          mutate("POST", { alias, sourceId: profile.sourceId })
        }
        onRename={async (account, alias) =>
          mutate("PATCH", { alias, sourceId: account.sourceId })
        }
        onDisconnect={async (account) =>
          mutate("DELETE", { sourceId: account.sourceId })
        }
      />
    </>
  );
}
