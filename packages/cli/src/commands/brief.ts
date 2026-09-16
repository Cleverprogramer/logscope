import type { Command } from "commander";
import chalk from "chalk";
import { getConfig } from "../config.js";
import { readLogFiles } from "../reader.js";
import { groupEntries } from "../grouping/index.js";
import { extractDurations, summarize, type LatencyStats } from "../analysis/latency.js";
import { findGaps, formatDuration } from "../analysis/gaps.js";
import { detectSpikes } from "../analysis/anomalies.js";
import { parseDurationMs, parseTimeBound } from "../filter.js";
import type { LogEntry, LogLevel } from "../types.js";

export interface BriefOptions {
  /** Max error groups to surface. */
  top?: string;
  /** Bucket width for the rate-anomaly scan, e.g. "1m". */
  bucket?: string;
  json?: boolean;
  markdown?: boolean;
  after?: string;
  before?: string;
  /** Severity cutoffs as fractions of total lines (0-1). */
  severity?: { critical?: number; elevated?: number };
  severityCritical?: string;
  severityElevated?: string;
  exclude?: string[];
}

export type BriefSeverity = "critical" | "elevated" | "ok" | "unknown";

export interface BriefReport {
  totalLines: number;
  unparsedLines: number;
  levels: Record<LogLevel, number>;
  timeRange: { first: string | null; last: string | null };
  /** Error percentage (0-1), or null when there are no entries. */
  errorRate: number | null;
  severity: BriefSeverity;
  spanMs: number | null;
  ratePerMin: number | null;
  topErrors: Array<{ count: number; sample: string }>;
  latency: LatencyStats;
  /** Longest silence in milliseconds, or null with fewer than 2 stamps. */
  longestGapMs: number | null;
  /** The most anomalous error-rate bucket, or null when nothing stands out. */
  spike: { from: string; count: number; score: number | null } | null;
}

/** Default severity cutoffs as fractions of total lines. */
const DEFAULT_THRESHOLDS = { critical: 0.1, elevated: 0.02 };

/**
 * Resolve and validate severity cutoffs from options/config. Both are
 * fractions of total lines in (0, 1), and critical must sit above elevated.
 */
export function resolveSeverityThresholds(
  severity?: { critical?: number; elevated?: number },
): { critical: number; elevated: number } {
  const critical = severity?.critical ?? DEFAULT_THRESHOLDS.critical;
  const elevated = severity?.elevated ?? DEFAULT_THRESHOLDS.elevated;
  for (const [name, value] of [
    ["severity.critical", critical],
    ["severity.elevated", elevated],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0 || value >= 1) {
      throw new Error(`Invalid ${name} "${value}". Use a fraction between 0 and 1, e.g. 0.1.`);
    }
  }
  if (critical <= elevated) {
    throw new Error(
      `Invalid severity thresholds: critical (${critical}) must be greater than elevated (${elevated}).`,
    );
  }
  return { critical, elevated };
}

function getSeverity(
  errorRate: number | null,
  thresholds: { critical: number; elevated: number },
): BriefSeverity {
  if (errorRate === null) return "unknown";
  if (errorRate > thresholds.critical) return "critical";
  if (errorRate > thresholds.elevated) return "elevated";
  return "ok";
}

function filterByTimeWindow(entries: LogEntry[], options: BriefOptions): LogEntry[] {
  if (!options.after && !options.before) return entries;
  const after = options.after ? parseTimeBound(options.after, "--after") : null;
  const before = options.before ? parseTimeBound(options.before, "--before") : null;
  return entries.filter((entry) => {
    if (after || before) {
      if (!entry.timestamp) return false;
      if (after && entry.timestamp < after) return false;
      if (before && entry.timestamp > before) return false;
    }
    return true;
  });
}

/**
 * `logscope brief <files>` — one-shot incident digest composing the offline
 * analysis primitives: totals, time range, top error groups, latency
 * percentiles, the longest silence, and any error-rate spike.
 */
export function computeBrief(entries: LogEntry[], options: BriefOptions = {}): BriefReport {
  const filtered = filterByTimeWindow(entries, options);
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

  for (const entry of filtered) {
    levels[entry.level] += 1;
    if (entry.timestamp) {
      if (!first || entry.timestamp < first) first = entry.timestamp;
      if (!last || entry.timestamp > last) last = entry.timestamp;
    }
    durations.push(...extractDurations(entry.message));
  }

  const parsedTop = Number.parseInt(options.top ?? "3", 10);
  const topN = Number.isNaN(parsedTop) ? 3 : Math.max(0, parsedTop);
  const topErrors = groupEntries(filtered)
    .filter((g) => g.level === "ERROR")
    .slice(0, topN)
    .map((g) => ({ count: g.count, sample: g.sample }));

  const longest = findGaps(filtered, 1)[0] ?? null;

  let spike: BriefReport["spike"] = null;
  const bucketMs = parseDurationMs(options.bucket ?? "1m");
  if (bucketMs) {
    const errorTimes = filtered
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

  const errorRate = filtered.length > 0 ? levels.ERROR / filtered.length : null;
  const severity = getSeverity(errorRate, resolveSeverityThresholds(options.severity));
  const spanMs = first && last ? last.getTime() - first.getTime() : null;
  const ratePerMin = spanMs && spanMs > 0 ? (filtered.length / spanMs) * 60_000 : null;

  return {
    totalLines: filtered.length,
    unparsedLines: filtered.filter((e) => e.unparsed).length,
    levels,
    timeRange: {
      first: first ? first.toISOString() : null,
      last: last ? last.toISOString() : null,
    },
    errorRate,
    severity,
    spanMs,
    ratePerMin,
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
    ? `${report.timeRange.first.slice(11, 19)} → ${report.timeRange.last!.slice(11, 19)}` +
      (report.spanMs !== null ? ` (${formatDuration(report.spanMs)})` : "")
    : "no timestamps";
  const rate = report.errorRate === null ? "n/a" : `${(report.errorRate * 100).toFixed(1)}%`;
  const severityDot: Record<BriefSeverity, string> = {
    critical: "●",
    elevated: "▲",
    ok: "○",
    unknown: "·",
  };
  const rateStr = report.ratePerMin !== null ? ` · ${report.ratePerMin.toFixed(1)}/min` : "";

  lines.push(
    `${severityDot[report.severity]} ${report.severity.toUpperCase()} · ${report.totalLines} lines · ${range} · ${rate} errors` +
      rateStr +
      (report.unparsedLines > 0 ? ` · ${report.unparsedLines} unparsed` : ""),
  );
  lines.push(
    `levels: ${report.levels.ERROR} error, ${report.levels.WARN} warn, ` +
      `${report.levels.INFO} info, ${report.levels.DEBUG} debug, ${report.levels.UNKNOWN} unknown`,
  );

  if (report.topErrors.length > 0) {
    lines.push(`── top ${report.topErrors.length} error group(s) ──`);
    for (const [i, group] of report.topErrors.entries()) {
      lines.push(`  ${i + 1}. ×${group.count} ${group.sample}`);
    }
  } else {
    lines.push("top errors: none");
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

  if (!report.spike && report.levels.WARN > 5) {
    lines.push(`note: no error spike but ${report.levels.WARN} warnings — check WARN groups`);
  }

  return lines;
}

/** Markdown table for incident reports (Slack/Jira-friendly). */
export function renderBriefMarkdown(file: string, report: BriefReport): string {
  const range = report.timeRange.first ? `${report.timeRange.first} → ${report.timeRange.last}` : "n/a";
  const rate = report.errorRate === null ? "n/a" : `${(report.errorRate * 100).toFixed(1)}%`;
  const span = report.spanMs !== null ? formatDuration(report.spanMs) : "n/a";
  const rpm = report.ratePerMin !== null ? report.ratePerMin.toFixed(1) : "n/a";
  const lines: string[] = [];
  lines.push(`# logscope brief — ${file}`);
  lines.push("");
  lines.push(`| Metric | Value |`);
  lines.push(`|---|---|`);
  lines.push(`| Severity | **${report.severity.toUpperCase()}** |`);
  lines.push(`| Lines | ${report.totalLines} (${rate} errors) |`);
  lines.push(`| Range | ${range} (${span}) |`);
  lines.push(`| Rate | ${rpm}/min |`);
  lines.push(`| Levels | ${report.levels.ERROR} err, ${report.levels.WARN} warn, ${report.levels.INFO} info |`);
  lines.push(`| Longest silence | ${report.longestGapMs !== null ? formatDuration(report.longestGapMs) : "n/a"} |`);
  lines.push(`| Spike | ${report.spike ? `${report.spike.count} errors @ ${report.spike.from} (z=${report.spike.score ?? "∞"})` : "none"} |`);
  if (report.topErrors.length > 0) {
    lines.push("");
    lines.push(`## Top Errors`);
    for (const [i, g] of report.topErrors.entries()) {
      lines.push(`${i + 1}. ×${g.count} \`${g.sample}\``);
    }
  }
  if (report.latency.count > 0) {
    lines.push("");
    lines.push(`## Latency`);
    lines.push(`p50 ${Math.round(report.latency.p50!)}ms · p95 ${Math.round(report.latency.p95!)}ms · p99 ${Math.round(report.latency.p99!)}ms · max ${Math.round(report.latency.max!)}ms`);
  }
  return lines.join("\n");
}

export async function briefCommand(files: string[], options: BriefOptions): Promise<void> {
  const config = getConfig();
  const configured = { ...config.severity, ...options.severity };
  options = {
    ...options,
    severity: resolveSeverityThresholds({
      critical: options.severityCritical !== undefined ? Number(options.severityCritical) : configured.critical,
      elevated: options.severityElevated !== undefined ? Number(options.severityElevated) : configured.elevated,
    }),
  };
  const result = await readLogFiles(files, { exclude: options.exclude });
  const report = computeBrief(result.entries, options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
    return;
  }

  if (options.markdown) {
    console.log(renderBriefMarkdown(files.join(", "), report));
    return;
  }

  console.log(chalk.bold.underline(`logscope brief — ${files.join(", ")}`));
  console.log();
  const [headline, ...rest] = renderBrief(files.join(", "), report);
  console.log(chalk.bold(headline));
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
    .option("--after <when>", 'window lower bound ("30s", "2h", ISO date)')
    .option("--before <when>", 'window upper bound ("30s", "2h", ISO date)')
    .option("--json", "output machine-readable JSON")
    .option("--severity-critical <fraction>", "critical error-rate cutoff (0 < value < 1; default 0.1)")
    .option("--severity-elevated <fraction>", "elevated error-rate cutoff (0 < value < 1; default 0.02)")
    .option("--markdown", "output markdown report for incident triage")
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

