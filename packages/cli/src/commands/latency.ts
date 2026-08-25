import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { makeFilter, type LevelFilterOptions } from "../filter.js";
import { extractDurations, extractRoute, summarize, type LatencyStats } from "../analysis/latency.js";

export interface LatencyOptions extends LevelFilterOptions {}

interface RouteBucket {
  route: string;
  samples: number[];
}

function renderRow(label: string, stats: LatencyStats): string {
  const p = painter();
  const fmt = (v: number | null) => (v === null ? "-" : `${Number(v.toFixed(1))}ms`);
  return (
    `  ${p.bold(label.padEnd(24))}` +
    `${String(stats.count).padEnd(8)}${fmt(stats.p50).padEnd(10)}${fmt(stats.p95).padEnd(10)}${fmt(stats.p99).padEnd(10)}${fmt(stats.max)}`
  );
}

/**
 * `logscope latency <files>` — pull duration samples out of messages and
 * report percentiles overall and per route.
 */
export async function latencyCommand(files: string[], options: LatencyOptions): Promise<void> {
  const result = await readLogFiles(files);
  const matches = makeFilter(options);

  const all: number[] = [];
  const routes = new Map<string, RouteBucket>();
  for (const entry of result.entries) {
    if (!matches(entry)) continue;
    for (const ms of extractDurations(entry.message)) {
      all.push(ms);
      const route = extractRoute(entry.message);
      if (route) {
        let bucket = routes.get(route);
        if (!bucket) {
          bucket = { route, samples: [] };
          routes.set(route, bucket);
        }
        bucket.samples.push(ms);
      }
    }
  }

  console.log(chalk.bold.underline(`logscope latency — ${files.join(", ")}`));
  console.log();
  console.log(chalk.dim(`  ${"route".padEnd(24)}count   p50       p95       p99       max`));
  console.log(renderRow("overall", summarize(all)));
  const ranked = [...routes.values()].sort(
    (a, b) => (summarize(b.samples).p50 ?? 0) - (summarize(a.samples).p50 ?? 0),
  );
  for (const bucket of ranked.slice(0, 10)) {
    console.log(renderRow(bucket.route, summarize(bucket.samples)));
  }
  if (all.length === 0) {
    console.log(chalk.dim("\n  no durations found — try more files or loosen --level"));
  }
}

/** Register the latency subcommand on the CLI program. */
export function registerLatencyCommand(program: Command): void {
  program
    .command("latency")
    .description("Extract durations from messages and compute p50/p95/p99")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--level <levels>", 'filter by level(s), e.g. "warn,error"')
    .option("--grep <pattern>", "filter by text/regex match")
    .action(async (files: string[], options: LatencyOptions) => {
      try {
        await latencyCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
