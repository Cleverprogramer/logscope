import chalk from "chalk";
import type { Command } from "commander";
import { parseSince, type LevelFilterOptions } from "../filter.js";
import { formatGroups } from "../format.js";
import { groupEntries, type LogGroup } from "../grouping/index.js";
import { readLogFiles } from "../reader.js";
import type { LogLevel } from "../types.js";

export interface StatsOptions extends LevelFilterOptions {
  /** Emit machine-readable JSON instead of the human report. */
  json?: boolean;
  /** Max groups to include in the report. */
  top?: string;
}

export interface StatsReport {
  totalLines: number;
  unparsedLines: number;
  levels: Record<LogLevel, number>;
  timeRange: { first: string | null; last: string | null };
  topGroups: Array<{
    level: LogLevel;
    count: number;
    sample: string;
    firstSeen: string | null;
    lastSeen: string | null;
  }>;
}

/**
 * `logscope stats <file>` — one-shot summary report: totals, per-level
 * breakdown, covered time range, and the most frequent message groups.
 * `--json` exports the same data for piping into other tools.
 */
export async function statsCommand(files: string[], options: StatsOptions): Promise<void> {
  const result = await readLogFiles(files);
  const cutoff = options.since ? parseSince(options.since) : null;

  const entries = result.entries.filter((entry) => {
    if (cutoff && (!entry.timestamp || entry.timestamp < cutoff)) return false;
    return true;
  });

  const levels: Record<LogLevel, number> = {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    DEBUG: 0,
    UNKNOWN: 0,
  };
  let first: Date | null = null;
  let last: Date | null = null;
  for (const entry of entries) {
    levels[entry.level] += 1;
    if (entry.timestamp) {
      if (!first || entry.timestamp < first) first = entry.timestamp;
      if (!last || entry.timestamp > last) last = entry.timestamp;
    }
  }

  const topN = Math.max(0, Number.parseInt(options.top ?? "10", 10) || 10);
  const groups: LogGroup[] = groupEntries(entries);
  const report: StatsReport = {
    totalLines: entries.length,
    unparsedLines: entries.filter((e) => e.unparsed).length,
    levels,
    timeRange: {
      first: first ? first.toISOString() : null,
      last: last ? last.toISOString() : null,
    },
    topGroups: groups.slice(0, topN).map((g) => ({
      level: g.level,
      count: g.count,
      sample: g.sample,
      firstSeen: g.firstSeen ? g.firstSeen.toISOString() : null,
      lastSeen: g.lastSeen ? g.lastSeen.toISOString() : null,
    })),
  };

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  renderReport(files.join(", "), report);
}

function renderReport(file: string, report: StatsReport): void {
  console.log(chalk.bold.underline(`logscope stats — ${file}`));
  console.log();

  const errorRate =
    report.totalLines > 0
      ? `${((report.levels.ERROR / report.totalLines) * 100).toFixed(1)}%`
      : "n/a";
  console.log(
    `${chalk.bold(String(report.totalLines))} lines · ` +
      `${chalk.red.bold(String(report.levels.ERROR))} errors (${errorRate}) · ` +
      `${chalk.yellow(String(report.levels.WARN))} warnings · ` +
      `${chalk.blue(String(report.levels.INFO))} info · ` +
      `${chalk.gray(String(report.levels.DEBUG))} debug` +
      (report.unparsedLines > 0
        ? ` · ${chalk.magenta(String(report.unparsedLines))} unparsed`
        : ""),
  );

  if (report.timeRange.first) {
    console.log(
      chalk.dim(
        `time range: ${report.timeRange.first.replace("T", " ").slice(0, 19)} → ` +
          `${report.timeRange.last!.replace("T", " ").slice(0, 19)}`,
      ),
    );
  }

  if (report.topGroups.length > 0) {
    console.log(chalk.dim(`\n── top ${report.topGroups.length} message group(s) ──`));
    for (const line of formatGroups(
      report.topGroups.map((g) => ({
        signature: "",
        lines: [],
        ...g,
        firstSeen: g.firstSeen ? new Date(g.firstSeen) : null,
        lastSeen: g.lastSeen ? new Date(g.lastSeen) : null,
      })),
      report.topGroups.length,
    )) {
      console.log(line);
    }
  }
}

/** Register the stats subcommand on the CLI program. */
export function registerStatsCommand(program: Command): void {
  program
    .command("stats")
    .description("Print a one-shot summary report for a log file")
    .argument("<files...>", "log file paths or glob patterns; \"-\" for stdin")
    .option("--level <levels>", 'filter by level(s), e.g. "error,warn"')
    .option("--since <when>", 'only include entries after this time ("30s", "2h", ISO date)')
    .option("--top <n>", "max message groups to show", "10")
    .option("--json", "output machine-readable JSON")
    .action(async (files: string[], options: StatsOptions) => {
      try {
        await statsCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
