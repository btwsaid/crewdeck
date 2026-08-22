import type {
  ProviderQuota,
  QuotaSnapshot,
  QuotaWindow,
} from "@/server/contracts";
import { formatAbsolute, resetCountdown } from "./format";
import { SectionCap } from "./section-cap";

function GaugeTrack({
  provider,
  window,
}: {
  provider: ProviderQuota;
  window: QuotaWindow;
}) {
  const known = window.percentRemaining !== null;
  const remaining = window.percentRemaining ?? 0;
  const level = remaining <= 15 ? "critical" : remaining <= 40 ? "low" : "";
  const label = known
    ? `${provider.label} ${window.label}: ${remaining} percent remaining${window.elapsedPercent === null ? "; elapsed tide mark unavailable" : `; ${window.elapsedPercent} percent of window elapsed`}`
    : `${provider.label} ${window.label}: percentage unavailable`;
  return (
    <div
      className={`gauge-track ${known ? "" : "unknown hatch"}`}
      role="img"
      aria-label={label}
    >
      {known && (
        <span
          className={`gauge-fill ${level}`}
          style={{ width: `${remaining}%` }}
        />
      )}
      {window.elapsedPercent !== null && (
        <span
          className="gauge-tide"
          style={{ left: `${window.elapsedPercent}%` }}
          title="window elapsed"
        />
      )}
    </div>
  );
}

function QueryError({ provider }: { provider: ProviderQuota }) {
  if (!provider.queryError) return null;
  return (
    <div className="gauge-query-error" role="status">
      <b>Latest source query failed</b> · observed{" "}
      {formatAbsolute(provider.queryError.observedAt)} —{" "}
      {provider.queryError.reason}
    </div>
  );
}

function GaugeWindowCard({
  provider,
  window,
}: {
  provider: ProviderQuota;
  window: QuotaWindow;
}) {
  const limiting = provider.limitingWindowIds.includes(window.id);
  const state = provider.state.status;
  return (
    <article className={`gauge-card ${limiting ? "limiting" : ""}`}>
      <div className="gauge-head">
        <span className="gauge-provider">{provider.label}</span>
        <span className="gauge-window">
          {window.label}
          {provider.accountAlias ? ` · ${provider.accountAlias}` : ""}
        </span>
        <span className="gauge-remaining">
          {window.percentRemaining === null ? "?" : window.percentRemaining}
          <small>{window.percentRemaining === null ? "" : "% left"}</small>
        </span>
      </div>
      <GaugeTrack provider={provider} window={window} />
      <div className="gauge-foot">
        <span className="reset">resets {resetCountdown(window.resetsAt)}</span>
        <span>· {formatAbsolute(window.resetsAt)}</span>
        <span className={`pace ${window.pace.status}`}>
          {window.pace.status === "unknown"
            ? "pace ?"
            : window.pace.status.replace("_", " ")}
        </span>
        <span className={`gauge-state ${state === "stale" ? "stale" : ""}`}>
          <span>{state}</span>
          {state === "stale" && (
            <span>
              {` · last authoritative ${provider.state.refreshedAt === null ? "time unavailable" : formatAbsolute(provider.state.refreshedAt)}`}
            </span>
          )}
        </span>
      </div>
      {window.pace.burnMultiple !== null && (
        <div className="gauge-why">
          pace source: {window.pace.burnMultiple.toFixed(1)}× burn multiple
        </div>
      )}
      <QueryError provider={provider} />
      {provider.reason && provider.reason !== provider.queryError?.reason && (
        <div className="gauge-why">{provider.reason}</div>
      )}
      {limiting && (
        <div className="gauge-limit-note">
          <b>limiting window</b> — authoritative source marks this window as
          binding
        </div>
      )}
    </article>
  );
}

function MissingWindowCard({
  provider,
  label,
}: {
  provider: ProviderQuota;
  label: string;
}) {
  return (
    <article className="gauge-card unavailable">
      <div className="gauge-head">
        <span className="gauge-provider">{provider.label}</span>
        <span className="gauge-window">{label}</span>
        <span className="gauge-remaining" aria-hidden="true">
          ?
        </span>
      </div>
      <div
        className="gauge-track unknown hatch"
        role="img"
        aria-label={`${provider.label} ${label} not reported`}
      />
      <div className="gauge-why">
        Authoritative source omitted this window; no usage or reset value was
        inferred.
      </div>
      <div className="gauge-foot">
        <span className="gauge-state">missing · no data</span>
      </div>
    </article>
  );
}

function missingClaudeWindows(provider: ProviderQuota) {
  if (provider.provider !== "claude" || provider.windows.length === 0)
    return [];
  const reported = new Set(provider.windows.map((window) => window.id));
  return [
    { id: "five_hour", label: "5-hour session" },
    { id: "seven_day", label: "week" },
  ].filter((window) => !reported.has(window.id));
}

function UnavailableProvider({ provider }: { provider: ProviderQuota }) {
  return (
    <article className="gauge-card unavailable">
      <div className="gauge-head">
        <span className="gauge-provider">{provider.label}</span>
        <span className="gauge-remaining" aria-hidden="true">
          ?
        </span>
      </div>
      <div
        className="gauge-track unknown hatch"
        role="img"
        aria-label={`${provider.label} quota unavailable`}
      />
      <QueryError provider={provider} />
      {provider.reason && provider.reason !== provider.queryError?.reason && (
        <div className="gauge-why">{provider.reason}</div>
      )}
      <div className="gauge-why">
        {provider.provider === "claude" &&
        ["rate_limited", "unavailable", "error"].includes(provider.state.status)
          ? "No last-known authoritative Claude allowance is available in this Crewdeck process. Allowance is unknown — not exhausted. Keep the official CLI signed in and let Crewdeck retry; no Claude process needs to stay running."
          : "Authoritative source supplied no quota windows; Crewdeck inferred no usage or reset values."}
      </div>
      <div className="gauge-foot">
        <span className="gauge-state">{provider.state.status} · no data</span>
      </div>
    </article>
  );
}

export function Provisions({ quota }: { quota: QuotaSnapshot | null }) {
  const loading = !quota || quota.source.status === "loading";
  return (
    <section aria-labelledby="provisions-title">
      <SectionCap note="authoritative local usage windows — never inferred">
        <h2 id="provisions-title">Provisions</h2>
      </SectionCap>
      {loading ? (
        <div className="provisions" aria-label="Loading quota sources">
          {Array.from({ length: 4 }, (_, index) => (
            <div className="skeleton gauge-skeleton" key={index} />
          ))}
        </div>
      ) : quota.source.status === "unsupported" ? (
        <article className="gauge-card unavailable unsupported-card">
          <div className="gauge-head">
            <span className="gauge-provider">Quota source</span>
            <span className="gauge-remaining">?</span>
          </div>
          <div
            className="gauge-track unknown hatch"
            role="img"
            aria-label="Unsupported quota source; no data"
          />
          <div className="gauge-why">{quota.source.reason}</div>
          <div className="gauge-state">unsupported · no data</div>
        </article>
      ) : quota.providers.length === 0 ? (
        <article className="gauge-card unavailable unsupported-card">
          <div className="gauge-head">
            <span className="gauge-provider">Quota source</span>
            <span className="gauge-remaining">?</span>
          </div>
          <div
            className="gauge-track unknown hatch"
            role="img"
            aria-label="Quota source unavailable; no data"
          />
          <div className="gauge-why">
            {quota.source.reason ??
              "no provider reported an authoritative window"}
          </div>
          <div className="gauge-state">unavailable · no data</div>
        </article>
      ) : (
        <div className="provisions">
          {quota.providers.flatMap((provider) =>
            provider.windows.length > 0
              ? [
                  ...provider.windows.map((window) => (
                    <GaugeWindowCard
                      provider={provider}
                      window={window}
                      key={`${provider.provider}:${provider.accountAlias ?? "none"}:${window.id}`}
                    />
                  )),
                  ...missingClaudeWindows(provider).map((window) => (
                    <MissingWindowCard
                      provider={provider}
                      label={window.label}
                      key={`${provider.provider}:missing:${window.id}`}
                    />
                  )),
                ]
              : [
                  <UnavailableProvider
                    provider={provider}
                    key={`${provider.provider}:unavailable`}
                  />,
                ],
          )}
        </div>
      )}
    </section>
  );
}
