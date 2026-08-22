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

export function formatLocalDateTime(value: number): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short",
  }).format(value);
}

export function formatRelativeAge(value: number, now = Date.now()): string {
  const elapsed = now - value;
  if (elapsed < -1_000) return "at a time ahead of the local clock";
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
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
