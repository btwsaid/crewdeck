import { formatElapsed } from "@/server/elapsed";
import { resetCountdown } from "@/server/time";

export { formatElapsed, resetCountdown };

export function formatAbsolute(value: number | null): string {
  if (value === null) return "absolute reset unavailable";
  return new Intl.DateTimeFormat(undefined, {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatAgo(value: number | null, now = Date.now()): string {
  if (value === null) return "time unavailable";
  const minutes = Math.max(0, Math.floor((now - value) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m ago`;
  return `${Math.floor(hours / 24)}d ${hours % 24}h ago`;
}
