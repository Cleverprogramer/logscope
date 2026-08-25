import chalk from "chalk";
import type { LogGroup } from "./grouping/index.js";
import type { LogLevel } from "./types.js";

/** Chalk color per log level. */
const LEVEL_COLORS: Record<LogLevel, (text: string) => string> = {
  ERROR: chalk.red,
  WARN: chalk.yellow,
  INFO: chalk.blue,
  DEBUG: chalk.gray,
  UNKNOWN: chalk.magenta,
};

/** Pad level to a fixed width so output columns line up. */
const LEVEL_WIDTH = 7; // "UNKNOWN".length

export function colorizeLevel(level: LogLevel): string {
  const padded = level.padEnd(LEVEL_WIDTH);
  return LEVEL_COLORS[level](padded);
}

export function formatTimestamp(timestamp: Date | null): string {
  if (!timestamp) return chalk.gray("                 ".slice(0, 19));
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
  const lineNo = chalk.dim(String(entry.line + 1).padStart(5));
  const ts = formatTimestamp(entry.timestamp);
  const level = colorizeLevel(entry.level);

  let message = entry.message;
  if (entry.unparsed) {
    message = `${chalk.magenta("⟨unparsed⟩")} ${message}`;
  }

  return `${lineNo} ${chalk.gray(ts)} ${level} ${message}`;
}

/** One-line summary shown after a `read` run. */
export function formatSummary(result: { totalLines: number; unparsedLines: number }): string {
  const parts = [`${result.totalLines} lines parsed`];
  if (result.unparsedLines > 0) {
    parts.push(chalk.yellow(`${result.unparsedLines} unparsed`));
  }
  return chalk.dim(`— ${parts.join(", ")}`);
}

/** Render "×3 · first/last seen" suffix for a group. */
function formatGroupMeta(group: LogGroup): string {
  const seen: string[] = [];
  if (group.firstSeen) {
    const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    seen.push(fmt(group.firstSeen));
    if (group.lastSeen && group.lastSeen !== group.firstSeen) seen.push(fmt(group.lastSeen));
  }
  const times = seen.length > 0 ? chalk.dim(` (${seen.join(" → ")})`) : "";
  return `${chalk.bold(`×${group.count}`)}${times}`;
}

/**
 * Format the top N groups (already sorted by frequency) as a ranked list.
 */
export function formatGroups(groups: LogGroup[], topN = 10): string[] {
  return groups.slice(0, topN).map((group, i) => {
    const rank = chalk.dim(`${String(i + 1).padStart(2)}.`);
    const level = colorizeLevel(group.level);
    return `${rank} ${level} ${formatGroupMeta(group)} ${group.sample}`;
  });
}
