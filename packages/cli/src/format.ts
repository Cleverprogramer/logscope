import { painter } from "./color.js";
import type { LogGroup } from "./grouping/index.js";
import type { LogLevel } from "./types.js";
import { levelIcon, symbol } from "./symbols.js";

/** Chalk color name per log level, resolved through the paint gate. */
const LEVEL_COLOR_NAMES: Record<LogLevel, "red" | "yellow" | "blue" | "gray" | "magenta"> = {
  ERROR: "red",
  WARN: "yellow",
  INFO: "blue",
  DEBUG: "gray",
  UNKNOWN: "magenta",
};

function colorizeLevel(level: LogLevel, icons = false): string {
  const padded = level.padEnd(LEVEL_WIDTH);
  const icon = icons ? `${levelIcon(level)} ` : "";
  return painter()[LEVEL_COLOR_NAMES[level]](`${icon}${padded}`);
}

/** Pad level to a fixed width so output columns line up. */
const LEVEL_WIDTH = 7; // "UNKNOWN".length

export function formatTimestamp(timestamp: Date | null, tz?: string, pattern?: string): string {
  if (!timestamp) return painter().gray("                 ".slice(0, 19));
  const text = pattern ? formatPattern(timestamp, tz, pattern) : tz ? formatInZone(timestamp, tz) : timestamp.toISOString().replace("T", " ").slice(0, 19);
  return painter().gray(text);
}

function formatPattern(timestamp: Date, tz: string | undefined, pattern: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: tz ?? "UTC", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", fractionalSecondDigits: 3, hour12: false }).formatToParts(timestamp).reduce<Record<string, string>>((acc, part) => { acc[part.type] = part.value; return acc; }, {});
  const tokens: Record<string, string> = { YYYY: parts.year!, MM: parts.month!, DD: parts.day!, HH: parts.hour!, mm: parts.minute!, ss: parts.second!, SSS: parts.fractionalSecond! };
  const remainder = pattern.replace(/YYYY|SSS|MM|DD|HH|mm|ss/g, "");
  if (/[YMDHmsS]/.test(remainder)) throw new Error("Invalid --time-format. Use YYYY, MM, DD, HH, mm, ss, and SSS tokens.");
  return pattern.replace(/YYYY|SSS|MM|DD|HH|mm|ss/g, (token) => tokens[token]!);
}

/**
 * Validate an IANA timezone name, returning it on success. Throws a
 * friendly error for garbage so commands can fail fast before output.
 */
export function assertTimeZone(tz: string): string {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: tz });
    return tz;
  } catch {
    throw new Error(`Unknown timezone "${tz}". Use IANA names like UTC, America/New_York.`);
  }
}

/** "YYYY-MM-DD HH:mm:ss" rendering of `timestamp` in the given IANA zone. */
function formatInZone(timestamp: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  })
    .formatToParts(timestamp)
    .reduce<Record<string, string>>((acc, p) => {
      acc[p.type] = p.value;
      return acc;
    }, {});
  const { year, month, day, hour, minute, second } = parts as Record<string, string>;
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/**
 * Format one entry as a single colored console line. `tz` converts the
 * displayed timestamp to an IANA zone; omitted means UTC ISO rendering.
 */
export function formatEntry(
  entry: {
    line: number;
    timestamp: Date | null;
    level: LogLevel;
    message: string;
    unparsed: boolean;
    source?: string;
    metadata?: Record<string, unknown>;
  },
  tz?: string,
  opts?: { showSource?: boolean; mode?: "compact" | "verbose"; icons?: boolean; timeFormat?: string },
): string {
  if (opts?.mode === "compact") {
    const prefix = entry.source && opts.showSource ? `[${basename(entry.source)}] ` : "";
    return `${colorizeLevel(entry.level, opts?.icons).trim()} ${prefix}${entry.message.replace(/\s+/g, " ")}`;
  }
  const lineNo = painter().dim(String(entry.line + 1).padStart(5));
  const ts = formatTimestamp(entry.timestamp, tz, opts?.timeFormat);
  const level = colorizeLevel(entry.level, opts?.icons);
  const src =
    opts?.showSource && entry.source
      ? painter().cyan(`[${basename(entry.source)}] `)
      : "";

  let message = entry.message;
  if (entry.unparsed) {
    message = `${painter().magenta(symbol("⟨unparsed⟩", "<unparsed>"))} ${message}`;
  }

  const metadata = opts?.mode === "verbose" && entry.metadata && Object.keys(entry.metadata).length > 0
    ? `\n  metadata: ${JSON.stringify(entry.metadata)}`
    : "";
  return `${lineNo} ${ts} ${level} ${src}${message}${metadata}`;
}

/** Final path segment, for compact multi-file display. */
function basename(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? path : path.slice(idx + 1);
}

/**
 * Serialize one entry as an NDJSON record. Pure data — no decorations —
 * so downstream tools can consume `--out jsonl` streams directly.
 */
export function formatEntryJson(entry: {
  line: number;
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  raw: string;
  unparsed: boolean;
  metadata?: Record<string, unknown>;
}): string {
  return JSON.stringify({
    line: entry.line,
    timestamp: entry.timestamp ? entry.timestamp.toISOString() : null,
    level: entry.level,
    message: entry.message,
    ...(entry.metadata ? { metadata: entry.metadata } : {}),
    unparsed: entry.unparsed,
  });
}

/** One-line summary shown after a `read` run. */
export function formatSummary(result: { totalLines: number; unparsedLines: number }): string {
  const parts = [`${result.totalLines} lines parsed`];
  if (result.unparsedLines > 0) {
    parts.push(painter().yellow(`${result.unparsedLines} unparsed`));
  }
  return painter().dim(`— ${parts.join(", ")}`);
}

/** Render "×3 · first/last seen" suffix for a group. */
function formatGroupMeta(group: LogGroup): string {
  const seen: string[] = [];
  if (group.firstSeen) {
    const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    seen.push(fmt(group.firstSeen));
    if (group.lastSeen && group.lastSeen !== group.firstSeen) seen.push(fmt(group.lastSeen));
  }
  const times = seen.length > 0 ? painter().dim(` (${seen.join(" → ")})`) : "";
  return `${painter().bold(`×${group.count}`)}${times}`;
}

/**
 * Format the top N groups (already sorted by frequency) as a ranked list.
 */
export function formatGroups(groups: LogGroup[], topN = 10): string[] {
  return groups.slice(0, topN).map((group, i) => {
    const rank = painter().dim(`${String(i + 1).padStart(2)}.`);
    const level = colorizeLevel(group.level);
    return `${rank} ${level} ${formatGroupMeta(group)} ${group.sample}`;
  });
}
