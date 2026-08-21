"use client";

import type { KeyboardEvent } from "react";
import { AnchorIcon } from "./icons";

export type View = "deck" | "accounts";

export function Masthead({
  view,
  onView,
  clock,
  feed,
  summary,
}: {
  view: View;
  onView: (view: View) => void;
  clock: string;
  feed: "connecting" | "live" | "reconnecting" | "stale" | "partial";
  summary: string;
}) {
  const moveTab = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next: View =
      event.key === "ArrowLeft" || event.key === "Home" ? "deck" : "accounts";
    onView(next);
    document.getElementById(`tab-${next}`)?.focus();
  };
  return (
    <header className="masthead">
      <div className="wordmark">
        <span className="anchor-mark">
          <AnchorIcon />
        </span>
        <b>CREWDECK</b>
        <span>{summary}</span>
      </div>
      <nav role="tablist" aria-label="Views">
        {(["deck", "accounts"] as const).map((candidate) => (
          <button
            className="viewtab"
            role="tab"
            id={`tab-${candidate}`}
            aria-selected={view === candidate}
            aria-controls={`view-${candidate}`}
            tabIndex={view === candidate ? 0 : -1}
            onClick={() => onView(candidate)}
            onKeyDown={moveTab}
            key={candidate}
          >
            {candidate}
          </button>
        ))}
      </nav>
      <div className="mast-right">
        <span className="clock" aria-label={`Local time ${clock}`}>
          {clock}
        </span>
        <span
          className={`feedstate ${feed === "live" ? "live" : feed === "partial" || feed === "stale" ? "stale" : "off"}`}
        >
          <span className="dot" />
          <span>{feed}</span>
        </span>
      </div>
    </header>
  );
}
