import type { LogEntry, LogLevel, ParseOptions } from "../types.js";
import { parseTimestamp } from "./timestamp.js";
import { unknownEntry } from "./plain.js";

/**
 * JSON logs: one object per line (NDJSON). Field names vary wildly between
 * libraries, so we accept the common aliases:
 *   timestamp / time / ts / @timestamp / datetime
 *   level     / severity / lvl
 *   message   / msg / text
 * Everything else is kept as metadata.
 */

interface FieldAliases {
  timestamp?: string[];
  level?: string[];
  message?: string[];
}

const ALIASES: FieldAliases = {
  timestamp: ["timestamp", "time", "ts", "@timestamp", "datetime", "_t"],
  level: ["level", "severity", "lvl"],
  message: ["message", "msg", "text"],
};

function pick(obj: Record<string, unknown>, names?: string[]): unknown {
  if (!names) return undefined;
  for (const name of names) {
    if (obj[name] !== undefined) return obj[name];
  }
  return undefined;
}

function normalizeLevel(value: unknown): LogLevel | null {
  if (typeof value !== "string") return null;
  const upper = value.toUpperCase();
  if (upper === "ERROR" || upper === "FATAL" || upper === "CRITICAL") return "ERROR";
  if (upper === "WARN" || upper === "WARNING") return "WARN";
  if (upper === "INFO") return "INFO";
  if (upper === "DEBUG" || upper === "TRACE") return "DEBUG";
  return null;
}

function normalizeTimestamp(value: unknown): Date | null {
  if (typeof value === "number") {
    // Assume epoch milliseconds for large values, seconds for small ones.
    const ms = value > 1e12 ? value : value * 1000;
    const date = new Date(ms);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  if (typeof value === "string") return parseTimestamp(value);
  return null;
}

/** Parse one NDJSON line; returns null if the line isn't a JSON object. */
export function parseJsonLine(raw: string): Omit<LogEntry, "line"> | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) return null;

  let obj: unknown;
  try {
    obj = JSON.parse(trimmed);
  } catch {
    return null;
  }
  if (typeof obj !== "object" || obj === null || Array.isArray(obj)) return null;

  const record = obj as Record<string, unknown>;
  const level = normalizeLevel(pick(record, ALIASES.level));
  const messageValue = pick(record, ALIASES.message);

  // A line that parses as JSON but has neither a recognizable level nor a
  // message isn't really a log entry — treat it as unparsed.
  if (level === null && typeof messageValue !== "string") return null;

  const metadata: Record<string, unknown> = {};
  const knownFields = new Set([...ALIASES.timestamp!, ...ALIASES.level!, ...ALIASES.message!]);
  for (const [key, value] of Object.entries(record)) {
    if (!knownFields.has(key)) metadata[key] = value;
  }

  return {
    raw,
    timestamp: normalizeTimestamp(pick(record, ALIASES.timestamp)),
    level: level ?? "UNKNOWN",
    message: typeof messageValue === "string" ? messageValue : String(messageValue),
    metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    unparsed: false,
  };
}

/** Parse a whole file's lines as NDJSON. Non-JSON lines become UNKNOWN entries. */
export function parseJson(lines: string[], options: ParseOptions = {}): LogEntry[] {
  const startLine = options.startLine ?? 0;
  return lines.map((raw, i) => {
    const parsed = parseJsonLine(raw);
    if (parsed) return { ...parsed, line: startLine + i };
    return unknownEntry(raw, startLine + i);
  });
}
