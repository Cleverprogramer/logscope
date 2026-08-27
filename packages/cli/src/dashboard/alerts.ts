import type { LogEntry } from "../types.js";

export const ALERT_THRESHOLDS = [null, 1, 5, 10, 25] as const;

export function recentErrorCount(entries: LogEntry[], now: number, windowMs = 60_000): number {
  return entries.filter((entry) => entry.level === "ERROR" && entry.timestamp && now - entry.timestamp.getTime() <= windowMs).length;
}
