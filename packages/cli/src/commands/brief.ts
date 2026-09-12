import type { Command } from "commander";
import chalk from "chalk";
import { readLogFiles } from "../reader.js";
import { groupEntries } from "../grouping/index.js";
import { extractDurations, summarize, type LatencyStats } from "../analysis/latency.js";
import { findGaps, formatDuration } from "../analysis/gaps.js";
import { detectSpikes } from "../analysis/anomalies.js";
import { parseDurationMs } from "../filter.js";
import type { LogEntry, LogLevel } from "../types.js";

export interface BriefOptions {
  /** Max error groups to surface. */
  top?: string;
  /** Bucket width for the rate-anomaly scan, e.g. "1m". */
  bucket?: string;
  json?: boolean;
  exclude?: string[];
}

export interface BriefReport {
  totalLines: number;
  unparsedLines: number;
  levels: Record<LogLevel, number>;
  timeRange: { first: string | null; last: string | null };
  /** Error percentage (0-1), or null when there are no entries. */
  errorRate: number | null;
  topErrors: Array<{ count: number; sample: string }>;
  latency: LatencyStats;
  /** Longest silence in milliseconds, or null with fewer than 2 stamps. */
  longestGapMs: number | null;
  /** The most anomalous error-rate bucket, or null when nothing stands out. */
  spike: { from: string; count: number; score: number | null } | null;
}

/**
 * `logscope brief <files>` — one-shot incident digest composing the offline
 * analysis primitives: totals, time range, top error groups, latency
 * percentiles, the longest silence, and any error-rate spike.
 */
export function computeBrief(entries: LogEntry[], options: BriefOptions = {}): BriefReport {
  const levels: Record<LogLevel, number> = {
    ERROR: 0,
    WARN: 0,
    INFO: 0,
    DEBUG: 0,
    UNKNOWN: 0,
  };
  let first: Date | null = null;
  let last: Date | null = null;
  const durations: number[] = [];

  for (const entry of entries) {
    levels[entry.level] += 1;
    if (entry.timestamp) {
      if (!first || entry.timestamp < first) first = entry.timestamp;
      if (!last || entry.timestamp > last) last = entry.timestamp;
    }
    durations.push(...extractDurations(entry.message));
  }

  const parsedTop = Number.parseInt(options.top ?? "3", 10);
  const topN = Number.isNaN(parsedTop) ? 3 : Math.max(0, parsedTop);
  const topErrors = groupEntries(entries)
    .filter((g) => g.level === "ERROR")
    .slice(0, topN)
    .map((g) => ({ count: g.count, sample: g.sample }));

  const longest = findGaps(entries, 1)[0] ?? null;

  let spike: BriefReport["spike"] = null;
  const bucketMs = parseDurationMs(options.bucket ?? "1m");
  if (bucketMs) {
    const errorTimes = entries
      .filter((e) => e.level === "ERROR" && e.timestamp)
      .map((e) => e.timestamp!.getTime());
    const worst = detectSpikes(errorTimes, bucketMs, 3).sort((a, b) => b.score - a.score)[0];
    if (worst) {
      spike = {
        from: worst.from.toISOString(),
        count: worst.count,
        score: Number.isFinite(worst.score) ? worst.score : null,
      };
    }
  }

  return {
    totalLines: entries.length,
    unparsedLines: entries.filter((e) => e.unparsed).length,
    levels,
    timeRange: {
      first: first ? first.toISOString() : null,
      last: last ? last.toISOString() : null,
    },
    errorRate: entries.length > 0 ? levels.ERROR / entries.length : null,
    topErrors,
    latency: summarize(durations),
    longestGapMs: longest ? longest.durationMs : null,
    spike,
  };
}


/** Human-readable digest lines (no ANSI colors — the command paints them). */
export function renderBrief(file: string, report: BriefReport): string[] {
  const lines: string[] = [];
  const range = report.timeRange.first
    ? `${report.timeRange.first.slice(11, 19)} → ${report.timeRange.last!.slice(11, 19)}`
    : "no timestamps";
  const rate = report.errorRate === null ? "n/a" : `${(report.errorRate * 100).toFixed(1)}%`;

  lines.push(
    `${report.totalLines} lines · ${range} · ${rate} errors` +
      (report.unparsedLines > 0 ? ` · ${report.unparsedLines} unparsed` : ""),
  );
  lines.push(
    `levels: ${report.levels.ERROR} error, ${report.levels.WARN} warn, ` +
      `${report.levels.INFO} info, ${report.levels.DEBUG} debug, ${report.levels.UNKNOWN} unknown`,
  );

  for (const [i, group] of report.topErrors.entries()) {
    lines.push(`top error ${i + 1}. ×${group.count} ${group.sample}`);
  }

  const latency = report.latency;
  if (latency.count > 0) {
    const fmt = (v: number | null) => (v === null ? "n/a" : `${Math.round(v)}ms`);
    lines.push(
      `latency: p50 ${fmt(latency.p50)} · p95 ${fmt(latency.p95)} · p99 ${fmt(latency.p99)} · ` +
        `max ${fmt(latency.max)} (${latency.count} samples)`,
    );
  } else {
    lines.push("latency: no durations found");
  }

  lines.push(
    report.longestGapMs !== null
      ? `longest silence: ${formatDuration(report.longestGapMs)}`
      : "longest silence: n/a",
  );

  lines.push(
    report.spike
      ? `spike: ${report.spike.count} errors around ${report.spike.from.slice(11, 19)}` +
          (report.spike.score !== null ? ` (z=${report.spike.score.toFixed(1)})` : " (z=∞)")
      : "spike: no error-rate anomalies",
  );
  return lines;
}

export async function briefCommand(files: string[], options: BriefOptions): Promise<void> {
  const result = await readLogFiles(files, { exclude: options.exclude });
  const report = computeBrief(result.entries, options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  console.log(chalk.bold.underline(`logscope brief — ${files.join(", ")}`));
  console.log();
  const [headline, ...rest] = renderBrief(files.join(", "), report);
  console.log(headline);
  for (const line of rest) console.log(chalk.dim(line));
}

/** Register the brief subcommand on the CLI program. */
export function registerBriefCommand(program: Command): void {
  program
    .command("brief")
    .description("One-shot executive digest: totals, errors, latency, silence, spikes")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--top <n>", "max error groups to surface", "3")
    .option("--bucket <duration>", "bucket width for the spike scan (10s, 1m)", "1m")
    .option("--json", "output machine-readable JSON")
    .option("--exclude <glob>", "exclude matching input files; repeat or comma-separate", collect, [])
    .action(async (files: string[], options: BriefOptions) => {
      try {
        await briefCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

