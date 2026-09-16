import type { Command } from "commander";
import chalk from "chalk";
import { readLogFiles } from "../reader.js";
import { buildTraces, aggregateTraces, type TraceGroup } from "../analysis/trace.js";
import { formatDuration } from "../analysis/gaps.js";

export interface TraceOptions {
  /** Custom ID regex; uses its first capture group when present. */
  id?: string;
  /** Drop traces with fewer events. */
  "min-events"?: string;
  /** Max traces to print. */
  limit?: string;
  /** Max entry lines shown per trace. */
  events?: string;
  /** Rank requests by span instead of printing timelines. */
  aggregate?: boolean;
  json?: boolean;
  exclude?: string[];
}

function compilePattern(value: string, flag: string): RegExp {
  try {
    return new RegExp(value);
  } catch (error) {
    throw new Error(`Invalid ${flag} pattern: ${error instanceof Error ? error.message : error}`);
  }
}

function levelSummary(group: TraceGroup): string {
  return Object.entries(group.counts)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => `${count} ${level.toLowerCase()}`)
    .join(", ");
}

function clockOf(entry: TraceGroup["entries"][number]): string {
  return entry.timestamp ? entry.timestamp.toISOString().slice(11, 19) : "--:--:--";
}

/** Build the human-readable trace report lines (color painted separately). */
export function renderTraces(groups: TraceGroup[], eventsPerTrace: number): string[] {
  const lines: string[] = [];
  for (const group of groups) {
    const span = group.durationMs !== null ? formatDuration(group.durationMs) : "no timestamps";
    lines.push(`▶ ${group.id} — ${group.entries.length} events · ${span} · ${levelSummary(group)}`);
    for (const entry of group.entries.slice(0, eventsPerTrace)) {
      lines.push(`    ${clockOf(entry)} ${entry.level.padEnd(7)} ${entry.message}`);
    }
    const hidden = group.entries.length - Math.min(eventsPerTrace, group.entries.length);
    if (hidden > 0) lines.push(`    +${hidden} more event(s)`);
    lines.push("");
  }
  if (lines.length > 0) lines.pop(); // drop the trailing blank separator
  return lines;
}

/**
 * Aggregate view: span distribution plus a slowest-first ranking table.
 * Groups must come from buildTraces (already sorted span-desc).
 */
export function renderTraceAggregate(groups: TraceGroup[], limit: number): string[] {
  const agg = aggregateTraces(groups);
  const fmt = (value: number | null) => (value === null ? "n/a" : formatDuration(value));
  const lines: string[] = [
    `${agg.count} traces · span p50 ${fmt(agg.p50)} · p95 ${fmt(agg.p95)} · max ${fmt(agg.max)}`,
    "",
  ];
  const shown = groups.slice(0, limit);
  const idWidth = Math.min(24, Math.max(2, ...shown.map((group) => group.id.length)));
  for (const [i, group] of shown.entries()) {
    lines.push(
      `${String(i + 1).padStart(3)}. ${group.id.padEnd(idWidth)}  ` +
        `${String(group.entries.length).padStart(4)} events · ` +
        `${fmt(group.durationMs)} · ${levelSummary(group)}`,
    );
  }
  if (groups.length > shown.length) {
    lines.push(`… and ${groups.length - shown.length} more — raise --limit to see them`);
  }
  return lines;
}

/**
 * `logscope trace <files>` — follow one request across interleaved lines by
 * extracting correlation IDs and printing per-ID timelines.
 */
export async function traceCommand(files: string[], options: TraceOptions): Promise<void> {
  const pattern = options.id ? compilePattern(options.id, "--id") : undefined;
  const minEvents = Math.max(1, Number.parseInt(options["min-events"] ?? "2", 10) || 2);
  const limit = Math.max(1, Number.parseInt(options.limit ?? "20", 10) || 20);
  const eventsPerTrace = Math.max(1, Number.parseInt(options.events ?? "10", 10) || 10);

  const result = await readLogFiles(files, { exclude: options.exclude });
  const all = buildTraces(result.entries, { pattern, minEvents });

  if (options.json) {
    console.log(
      JSON.stringify(
        all.map((group) => ({
          id: group.id,
          first: group.first ? group.first.toISOString() : null,
          last: group.last ? group.last.toISOString() : null,
          durationMs: group.durationMs,
          counts: group.counts,
          messages: group.entries.map((entry) => entry.message),
        })),
        null,
        2,
      ),
    );
    return;
  }

  const shown = all.slice(0, limit);
  console.log(
    chalk.bold.underline(
      `logscope trace — ${shown.length} trace(s) from ${files.join(", ")}`,
    ),
  );
  if (all.length === 0) {
    console.log(
      chalk.dim(
        minEvents > 1
          ? `\nno correlation ids with ≥${minEvents} events — lower --min-events or pass --id '<regex>'`
          : "\nno correlation ids found — pass --id '<regex>' to match your format",
      ),
    );
    return;
  }
  if (all.length > shown.length) {
    console.log(chalk.dim(`showing ${shown.length} of ${all.length} traces — raise --limit for more`));
  }
  if (options.aggregate) {
    console.log(chalk.bold.underline(`logscope trace — slowest requests in ${files.join(", ")}`));
    console.log();
    for (const line of renderTraceAggregate(all, limit)) console.log(line);
    return;
  }

  console.log();
  for (const line of renderTraces(shown, eventsPerTrace)) console.log(line);
}

/** Register the trace subcommand on the CLI program. */
export function registerTraceCommand(program: Command): void {
  program
    .command("trace")
    .description("Group log lines into per-request timelines by correlation ID")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--id <regex>", "custom correlation-id regex (first capture group)")
    .option("--min-events <n>", "drop traces with fewer events", "2")
    .option("--limit <n>", "max traces to print", "20")
    .option("--events <n>", "max entry lines shown per trace", "10")
    .option("--aggregate", "rank requests by span instead of printing timelines")
    .option("--json", "output machine-readable JSON")
    .option("--exclude <glob>", "exclude matching input files; repeat or comma-separate", collect, [])
    .action(async (files: string[], options: TraceOptions) => {
      try {
        await traceCommand(files, options);
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
