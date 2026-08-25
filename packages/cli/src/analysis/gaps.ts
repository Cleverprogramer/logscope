import type { LogEntry } from "../types.js";

/** A silent stretch between consecutive log entries. */
export interface Gap {
  /** Last entry before the silence. */
  from: Date;
  /** First entry after the silence. */
  to: Date;
  durationMs: number;
}

/**
 * Find inter-entry silences longer than `minGapMs`. Entries without
 * timestamps are ignored; the rest are sorted so out-of-order files still
 * produce correct gap boundaries.
 */
export function findGaps(entries: LogEntry[], minGapMs: number): Gap[] {
  const times = entries
    .map((e) => e.timestamp?.getTime())
    .filter((t): t is number => t !== undefined)
    .sort((a, b) => a - b);

  const gaps: Gap[] = [];
  for (let i = 1; i < times.length; i++) {
    const duration = times[i]! - times[i - 1]!;
    if (duration >= minGapMs) {
      gaps.push({ from: new Date(times[i - 1]!), to: new Date(times[i]!), durationMs: duration });
    }
  }
  // Longest silence first — that's the one worth staring at.
  return gaps.sort((a, b) => b.durationMs - a.durationMs);
}

/** Human rendering like "10m 0s" or "1m 30s". */
export function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}
