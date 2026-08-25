import type { LogEntry, LogLevel, ParseOptions } from "../types.js";
import { parseTimestamp } from "./timestamp.js";

/**
 * Matches common plain-text log shapes:
 *   [2024-01-15T10:30:45Z] ERROR Payment failed for order 123
 *   2024-01-15 10:30:45 ERROR Payment failed
 *   2024-01-15T10:30:45.123Z WARN Disk almost full
 *
 * Group 1: optional opening bracket
 * Group 2: timestamp (ISO-ish or "YYYY-MM-DD HH:mm:ss")
 * Group 3: closing bracket (optional, must match group 1)
 * Group 4: level word
 * Group 5: message body
 */
const PLAIN_LINE_RE =
  /^(\[)?(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)(\])?\s+(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|CRITICAL)\s+(.*)$/i;

const LEVEL_MAP: Record<string, LogLevel> = {
  ERROR: "ERROR",
  FATAL: "ERROR",
  CRITICAL: "ERROR",
  WARN: "WARN",
  WARNING: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
  TRACE: "DEBUG",
};

/** Parse a single plain-text line; returns null if it doesn't match the pattern. */
export function parsePlainLine(raw: string): Omit<LogEntry, "line"> | null {
  const match = PLAIN_LINE_RE.exec(raw.trim());
  if (!match) return null;

  // The regex guarantees groups 2 (timestamp), 4 (level), 5 (message) on match.
  const timestamp = parseTimestamp(match[2]!);
  const level = LEVEL_MAP[match[4]!.toUpperCase()] ?? "UNKNOWN";

  return {
    raw,
    timestamp,
    level,
    message: match[5]!.trim(),
    unparsed: false,
  };
}

/** Parse a whole file's lines as plain text. Unmatched lines become UNKNOWN entries. */
export function parsePlain(lines: string[], options: ParseOptions = {}): LogEntry[] {
  const startLine = options.startLine ?? 0;
  return lines.map((raw, i) => {
    const parsed = parsePlainLine(raw);
    if (parsed) return { ...parsed, line: startLine + i };
    return unknownEntry(raw, startLine + i);
  });
}

/** Build a flagged UNKNOWN entry for a line nothing could parse. */
export function unknownEntry(raw: string, line: number): LogEntry {
  return { raw, line, timestamp: null, level: "UNKNOWN", message: raw.trim(), unparsed: true };
}
