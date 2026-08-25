import type { LogEntry, LogLevel } from "../types.js";

/**
 * Error grouping & deduplication.
 *
 * Raw error messages differ only in their variable parts ("order 8841" vs
 * "order 8842", different UUIDs, quoted strings...). We normalize each
 * message into a stable *signature* by replacing those variable parts with
 * placeholders, then group entries sharing (level + signature).
 */

/** A cluster of log entries that share a normalized message signature. */
export interface LogGroup {
  /** Normalized signature — the grouping key. */
  signature: string;
  /** Level shared by every member of the group. */
  level: LogLevel;
  /** A representative raw message (the most recent one seen). */
  sample: string;
  /** How many entries are in this group. */
  count: number;
  /** Timestamp of the earliest entry, or null if none had one. */
  firstSeen: Date | null;
  /** Timestamp of the latest entry, or null if none had one. */
  lastSeen: Date | null;
  /** Source line numbers of the members (in file order). */
  lines: number[];
}

/**
 * UUIDs → <id>, long hex blobs → <hash>, IPv4 → <ip>, quoted strings →
 * <str>, bare numbers → <num>. Order matters: specific patterns first so a
 * UUID isn't half-eaten by the number rule.
 */
const NORMALIZERS: Array<[RegExp, string]> = [
  [/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<id>"],
  [/\b(?:[0-9a-f]{2}:){5}[0-9a-f]{2}\b/gi, "<mac>"],
  [/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, "<ip>"],
  [/\b[0-9a-f]{16,}\b/gi, "<hash>"],
  [/("[^"]*"|'[^']*'|`[^`]*`)/g, "<str>"],
  [/\b\d[\d_,]*(?:\.\d+)?\b/g, "<num>"],
];

/**
 * Reduce a message to its grouping signature: variable parts replaced with
 * placeholders, whitespace collapsed, lowercased. Null when there is no
 * meaningful content left.
 */
export function messageSignature(message: string): string {
  let out = message.toLowerCase();
  for (const [pattern, replacement] of NORMALIZERS) {
    out = out.replace(pattern, replacement);
  }
  out = out.replace(/\s+/g, " ").trim();
  return out || "";
}

interface MutableGroup {
  group: LogGroup;
}

/**
 * Group parsed entries by (level, message signature). Entries with no
 * usable signature (e.g. unparsed garbage) each stand alone and are kept in
 * the result only when they repeat; one-off noise stays visible via `count`.
 * Returned sorted by count descending, then by most-recent activity.
 */
export function groupEntries(entries: LogEntry[]): LogGroup[] {
  const byKey = new Map<string, MutableGroup>();

  for (const entry of entries) {
    const signature = messageSignature(entry.message);
    // Skip empty signatures entirely (blank lines etc.) — nothing to group.
    if (!signature) continue;

    const key = `${entry.level}::${signature}`;
    let bucket = byKey.get(key);
    if (!bucket) {
      bucket = {
        group: {
          signature,
          level: entry.level,
          sample: entry.message,
          count: 0,
          firstSeen: null,
          lastSeen: null,
          lines: [],
        },
      };
      byKey.set(key, bucket);
    }

    const g = bucket.group;
    g.count += 1;
    g.lines.push(entry.line);

    if (entry.timestamp) {
      if (!g.firstSeen || entry.timestamp < g.firstSeen) g.firstSeen = entry.timestamp;
      if (!g.lastSeen || entry.timestamp > g.lastSeen) g.lastSeen = entry.timestamp;
      // Keep the newest message as the sample — it's the most relevant.
      if (g.lastSeen === entry.timestamp) g.sample = entry.message;
    }
  }

  return [...byKey.values()]
    .map((b) => b.group)
    .sort((a, b) => b.count - a.count || Number(b.lastSeen ?? 0) - Number(a.lastSeen ?? 0));
}
