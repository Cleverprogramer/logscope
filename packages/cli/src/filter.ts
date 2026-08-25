import { parseTimestamp } from "./parser/timestamp.js";
import type { LogEntry, LogLevel } from "./types.js";

export interface LevelFilterOptions {
  /** Comma-separated levels to keep, e.g. "error,warn". Case-insensitive. */
  level?: string;
  /** Text or regex pattern the message/raw line must match. */
  grep?: string;
  /**
   * Time-window lower bound: either relative ("30s", "5m", "2h", "7d",
   * measured back from now) or an absolute ISO date/datetime.
   */
  since?: string;
}

const LEVEL_ALIASES: Record<string, LogLevel> = {
  error: "ERROR",
  warn: "WARN",
  warning: "WARN",
  info: "INFO",
  debug: "DEBUG",
  unknown: "UNKNOWN",
};

const DURATION_UNIT_MS: Record<string, number> = {
  s: 1_000,
  m: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  w: 604_800_000,
};

/** Parse a relative duration like "90s", "5m", "2h", "7d" into milliseconds. */
export function parseDurationMs(input: string): number | null {
  const match = /^(\d+)([smhdw])$/i.exec(input.trim());
  if (!match) return null;
  return Number(match[1]) * DURATION_UNIT_MS[match[2]!.toLowerCase()]!;
}

/**
 * Parse a `--since` value into a Date. Relative durations ("90s", "5m",
 * "2h", "7d") are measured back from now; anything else is parsed as an
 * absolute timestamp (naive values treated as UTC, same as log timestamps).
 * Throws a friendly error for unrecognizable input.
 */
export function parseSince(input: string, now: Date = new Date()): Date {
  const ms = parseDurationMs(input);
  if (ms !== null) return new Date(now.getTime() - ms);

  // Absolute date/datetime; naive values are treated as UTC, consistent
  // with how log timestamps themselves are parsed.
  const date = parseTimestamp(input);
  if (date) return date;

  throw new Error(
    `Invalid --since value "${input}". Use a duration like 30s, 5m, 2h, 7d or a date like 2024-01-01.`,
  );
}

/**
 * Build a predicate from the given filter options. All provided filters are
 * ANDed together (an entry must satisfy every one). With no options, every
 * entry passes. Entries without a timestamp fail `--since` (unknowable).
 */
export function makeFilter(options: LevelFilterOptions): (entry: LogEntry) => boolean {
  const predicates: Array<(entry: LogEntry) => boolean> = [];

  if (options.since) {
    const cutoff = parseSince(options.since);
    predicates.push((entry) => entry.timestamp !== null && entry.timestamp >= cutoff);
  }

  if (options.level) {
    const wanted = new Set<LogLevel>();
    for (const part of options.level.split(",")) {
      const normalized = LEVEL_ALIASES[part.trim().toLowerCase()];
      if (!normalized) {
        throw new Error(
          `Unknown level "${part.trim()}". Valid levels: error, warn, info, debug, unknown.`,
        );
      }
      wanted.add(normalized);
    }
    predicates.push((entry) => wanted.has(entry.level));
  }

  if (options.grep) {
    let regex: RegExp;
    try {
      regex = new RegExp(options.grep, "i");
    } catch (error) {
      throw new Error(`Invalid --grep pattern: ${error instanceof Error ? error.message : error}`);
    }
    predicates.push((entry) => regex.test(entry.message) || regex.test(entry.raw));
  }

  if (predicates.length === 0) return () => true;

  return (entry) => predicates.every((predicate) => predicate(entry));
}

/** Apply filters to an entry list. */
export function applyFilter(entries: LogEntry[], options: LevelFilterOptions): LogEntry[] {
  const predicate = makeFilter(options);
  return entries.filter(predicate);
}
