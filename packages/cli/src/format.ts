import { painter } from "./color.js";
import type { LogGroup } from "./grouping/index.js";
import type { LogLevel } from "./types.js";

/** Chalk color name per log level, resolved through the paint gate. */
const LEVEL_COLOR_NAMES: Record<LogLevel, "red" | "yellow" | "blue" | "gray" | "magenta"> = {
  ERROR: "red",
  WARN: "yellow",
  INFO: "blue",
  DEBUG: "gray",
  UNKNOWN: "magenta",
};

function colorizeLevel(level: LogLevel): string {
  const padded = level.padEnd(LEVEL_WIDTH);
  return painter()[LEVEL_COLOR_NAMES[level]](padded);
}

/** Pad level to a fixed width so output columns line up. */
const LEVEL_WIDTH = 7; // "UNKNOWN".length

export function formatTimestamp(timestamp: Date | null): string {
  if (!timestamp) return painter().gray("                 ".slice(0, 19));
  return timestamp.toISOString().replace("T", " ").slice(0, 19);
}

/** Format one entry as a single colored console line. */
export function formatEntry(entry: {
  line: number;
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  unparsed: boolean;
}): string {
  const lineNo = painter().dim(String(entry.line + 1).padStart(5));
  const ts = formatTimestamp(entry.timestamp);
  const level = colorizeLevel(entry.level);

  let message = entry.message;
  if (entry.unparsed) {
    message = `${painter().magenta("⟨unparsed⟩")} ${message}`;
  }

  return `${lineNo} ${painter().gray(ts)} ${level} ${message}`;
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
