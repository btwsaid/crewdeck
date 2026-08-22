import type { FleetSnapshot, QuotaSnapshot } from "@/server/contracts";
import { Pennant } from "./icons";

export function SourceBanners({
  fleet,
  quota,
  connectionStale,
}: {
  fleet: FleetSnapshot | null;
  quota: QuotaSnapshot | null;
  connectionStale: boolean;
}) {
  const banners: {
    key: string;
    error: boolean;
    text: string;
    detail: string;
  }[] = [];
  if (connectionStale)
    banners.push({
      key: "connection",
      error: true,
      text: "Live feed heartbeat stopped — snapshots and their original evidence update times are retained while Crewdeck reconnects.",
      detail:
        "SSE reconnect state · update times keep aging and are never replaced by reconnect attempts",
    });
  if (fleet && ["stale", "partial", "error"].includes(fleet.source.status))
    banners.push({
      key: "fleet",
      error: fleet.source.status === "error",
      text: fleet.source.reason ?? "Fleet source is not fully live.",
      detail: `fleet source · ${fleet.source.status}`,
    });
  if (
    quota &&
    ["stale", "partial", "error", "unsupported"].includes(quota.source.status)
  )
    banners.push({
      key: "quota",
      error:
        quota.source.status === "error" ||
        quota.source.status === "unsupported",
      text: quota.source.reason ?? "Quota source is not fully live.",
      detail: `quota source · ${quota.source.status}`,
    });
  return banners.map((banner) => (
    <div
      className={`src-banner ${banner.error ? "err" : ""}`}
      role="status"
      key={banner.key}
    >
      <Pennant status={banner.error ? "blocked" : "needs-decision"} />
      <div>
        {banner.text} <span className="mono">{banner.detail}</span>
      </div>
    </div>
  ));
}
