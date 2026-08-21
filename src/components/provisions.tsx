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
          {state}
        </span>
      </div>
      {window.pace.burnMultiple !== null && (
        <div className="gauge-why">
          pace source: {window.pace.burnMultiple.toFixed(1)}× burn multiple
        </div>
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
      <div className="gauge-why">
        {provider.reason ?? "authoritative window not reported"}
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
            provider.windows.length > 0 &&
            ["fresh", "stale"].includes(provider.state.status)
              ? provider.windows.map((window) => (
                  <GaugeWindowCard
                    provider={provider}
                    window={window}
                    key={`${provider.provider}:${provider.accountAlias ?? "none"}:${window.id}`}
                  />
                ))
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
