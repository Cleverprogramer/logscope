import type { Command } from "commander";
import chalk from "chalk";
import { applyConfigDefaults, getConfig } from "../config.js";
import { computeStats, type StatsOptions, type StatsReport } from "./stats.js";

export interface MetricsOptions extends StatsOptions {
  /** Namespace for emitted metric names. Defaults to "logscope". */
  prefix?: string;
}

/** Escape a label value per the Prometheus text-format rules. */
export function escapeLabelValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n");
}

/**
 * Render the stats report as Prometheus text-format (0.0.4) exposition.
 * Counters for volumes, gauges for the covered time span, and labeled
 * samples for the top message groups.
 */
export function renderPrometheus(report: StatsReport, prefix = "logscope"): string[] {
  const name = (metric: string) => `${prefix}_${metric}`;
  const lines: string[] = [];

  lines.push(`# HELP ${name("lines_total")} Total log lines analyzed.`);
  lines.push(`# TYPE ${name("lines_total")} counter`);
  lines.push(`${name("lines_total")} ${report.totalLines}`);

  lines.push(`# HELP ${name("unparsed_lines_total")} Lines no parser could handle.`);
  lines.push(`# TYPE ${name("unparsed_lines_total")} counter`);
  lines.push(`${name("unparsed_lines_total")} ${report.unparsedLines}`);

  lines.push(`# HELP ${name("level_total")} Lines per severity level.`);
  lines.push(`# TYPE ${name("level_total")} counter`);
  for (const [level, count] of Object.entries(report.levels)) {
    lines.push(`${name("level_total")}{level="${level.toLowerCase()}"} ${count}`);
  }

  if (report.timeRange.first && report.timeRange.last) {
    const first = Date.parse(report.timeRange.first) / 1000;
    const last = Date.parse(report.timeRange.last) / 1000;
    lines.push(`# HELP ${name("first_timestamp_seconds")} Earliest log timestamp (epoch seconds).`);
    lines.push(`# TYPE ${name("first_timestamp_seconds")} gauge`);
    lines.push(`${name("first_timestamp_seconds")} ${first}`);
    lines.push(`# HELP ${name("last_timestamp_seconds")} Latest log timestamp (epoch seconds).`);
    lines.push(`# TYPE ${name("last_timestamp_seconds")} gauge`);
    lines.push(`${name("last_timestamp_seconds")} ${last}`);
    lines.push(`# HELP ${name("span_seconds")} Seconds covered by the logged span.`);
    lines.push(`# TYPE ${name("span_seconds")} gauge`);
    lines.push(`${name("span_seconds")} ${last - first}`);
  }

  if (report.topGroups.length > 0) {
    lines.push(`# HELP ${name("group_total")} Events in the top message groups.`);
    lines.push(`# TYPE ${name("group_total")} counter`);
    for (const group of report.topGroups) {
      lines.push(
        `${name("group_total")}{level="${group.level.toLowerCase()}",` +
          `sample="${escapeLabelValue(group.sample)}"} ${group.count}`,
      );
    }
  }

  return lines;
}

/**
 * `logscope metrics <files>` — expose the stats report as Prometheus text
 * format for scraping pipelines, dashboards, and alert rules.
 */
export async function metricsCommand(files: string[], options: MetricsOptions): Promise<void> {
  options = applyConfigDefaults(options, getConfig());
  const report = await computeStats(files, options);
  for (const line of renderPrometheus(report, options.prefix ?? "logscope")) {
    console.log(line);
  }
}

/** Register the metrics subcommand on the CLI program. */
export function registerMetricsCommand(program: Command): void {
  program
    .command("metrics")
    .description("Emit the stats report in Prometheus text format")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--level <levels>", 'filter by level(s), e.g. "error,warn"')
    .option("--grep <pattern>", "filter by text/regex match on message")
    .option("--since <when>", 'only include entries after this time ("30s", "2h", ISO date)')
    .option("--after <when>", 'window lower bound ("30s", "2h", ISO date)')
    .option("--before <when>", 'window upper bound ("30s", "2h", ISO date)')
    .option("--top <n>", "max message groups to expose", "10")
    .option("--prefix <name>", "namespace for metric names", "logscope")
    .option("--exclude <glob>", "exclude matching input files; repeat or comma-separate", collect, [])
    .action(async (files: string[], options: MetricsOptions) => {
      try {
        await metricsCommand(files, options);
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
