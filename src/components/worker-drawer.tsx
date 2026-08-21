"use client";

import { useCallback } from "react";
import type { FleetHome, Worker } from "@/server/contracts";
import { elapsedTime } from "@/server/elapsed";
import { formatAbsolute, formatAgo, formatElapsed } from "./format";
import { SectionCap } from "./section-cap";
import { StatusTag } from "./status-tag";
import { useDialog } from "./use-dialog";

export function WorkerDrawer({
  worker,
  home,
  now,
  onClose,
}: {
  worker: Worker | null;
  home: FleetHome | undefined;
  now: number;
  onClose: () => void;
}) {
  const close = useCallback(() => onClose(), [onClose]);
  const reference = useDialog<HTMLElement>(worker !== null, close);
  if (!worker) return null;
  const elapsed = elapsedTime(worker.startedAt, worker.endedAt, now);
  return (
    <>
      <button
        className="drawer-scrim"
        aria-label="Close worker detail"
        onClick={onClose}
      />
      <aside
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-labelledby="worker-title"
        ref={reference}
      >
        <button
          className="close"
          onClick={onClose}
          aria-label="Close worker detail"
        >
          ✕
        </button>
        <div>
          <StatusTag status={worker.status} />
        </div>
        <h2 id="worker-title">{worker.id}</h2>
        {worker.blocker && (
          <div className="blocker-note">
            <div className="cap">
              <span>blocker</span> · <StatusTag status="blocked" />
            </div>
            {worker.blocker}
          </div>
        )}
        {worker.decision && (
          <div className="blocker-note decision">
            <div className="cap">
              <span>captain&apos;s call</span> ·{" "}
              <StatusTag status="needs-decision" />
            </div>
            {worker.decision}
          </div>
        )}
        <dl className="dl">
          <dt>Project</dt>
          <dd>
            {worker.project} <span className="kind">{worker.kind}</span>
          </dd>
          <dt>Task part</dt>
          <dd>{worker.taskPart}</dd>
          <dt>Runtime</dt>
          <dd>
            <span className="mono">{worker.runtime}</span> serving{" "}
            <span className="mono brass">{worker.model}</span>
          </dd>
          <dt>Effort</dt>
          <dd>{worker.effort}</dd>
          <dt>Elapsed</dt>
          <dd className="mono">
            {formatElapsed(elapsed.milliseconds)}{" "}
            {elapsed.running ? "elapsed" : "total"} ·{" "}
            {worker.elapsedBasis.replace("-", " ")}
          </dd>
          <dt>Phase</dt>
          <dd>{worker.phase.label}</dd>
          <dt>Next</dt>
          <dd>{worker.next}</dd>
          {worker.pr && (
            <>
              <dt>Pull request</dt>
              <dd className="mono">
                #{worker.pr.number} · {worker.pr.state}
              </dd>
            </>
          )}
          {worker.ci && (
            <>
              <dt>CI</dt>
              <dd className="mono">
                {worker.ci.state} · {worker.ci.label}
              </dd>
            </>
          )}
          <dt>Home</dt>
          <dd>{home?.label ?? "home unavailable"}</dd>
        </dl>
        <SectionCap>Log</SectionCap>
        <div className="timeline">
          <div className="tl-item">
            <div className="t">{formatAbsolute(worker.startedAt)}</div>
            <div className="what">worker record started</div>
          </div>
          <div className="tl-item now">
            <div className="t">{formatAgo(worker.last.at, now)}</div>
            <div className="what">{worker.last.text}</div>
          </div>
        </div>
        <p className="drawer-privacy">
          This presentation contains only allowlisted fleet fields. Prompts,
          terminal output, identities, local filesystem locations, credentials,
          and monetary data never reach the browser.
        </p>
      </aside>
    </>
  );
}
