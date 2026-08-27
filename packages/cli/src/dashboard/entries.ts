import type { LogEntry } from "../types.js";

/** Return entries whose level or message contains the query (case-insensitive). */
export function filterEntries(entries: LogEntry[], query: string): LogEntry[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return entries;
  return entries.filter((entry) => `${entry.level} ${entry.message}`.toLowerCase().includes(needle));
}
