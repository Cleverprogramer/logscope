import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { parseDurationMs } from "../filter.js";
import { findGaps, formatDuration, type Gap } from "../analysis/gaps.js";
import type { LogEntry } from "../types.js";

export interface GapsOptions {
  /** Minimum silence length to report, e.g. "5m". */
  minGap?: string;
}

function renderGap(gap: Gap, rank: number): string {
  const p = painter();
  const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
  return (
    `${p.dim(`${String(rank).padStart(2)}.`)} ` +
    `${p.yellow(formatDuration(gap.durationMs)).padEnd(12)} ` +
    `${fmt(gap.from)} → ${fmt(gap.to)}`
  );
}

/**
 * `logscope gaps <files>` — report silent stretches where no entries were
 * logged for at least --min-gap. Longest first.
 */
export async function gapsCommand(files: string[], options: GapsOptions): Promise<void> {
  const minGapMs = options.minGap ? parseDurationMs(options.minGap) : 5 * 60_000;
  if (minGapMs === null) {
    throw new Error(`Invalid --min-gap "${options.minGap}". Use durations like 30s, 5m, 2h.`);
  }

  const result = await readLogFiles(files);
  const entries: LogEntry[] = result.entries;
  const gaps = findGaps(entries, minGapMs);

  console.log(
    chalk.bold.underline(`logscope gaps — ${files.join(", ")}`),
  );
  if (gaps.length === 0) {
    console.log(chalk.green(`✓ no silences ≥ ${formatDuration(minGapMs)} across ${entries.length} timestamped entries`));
    return;
  }
  console.log(chalk.dim(`${gaps.length} gap(s) ≥ ${formatDuration(minGapMs)}:\n`));
  gaps.forEach((gap, i) => console.log(renderGap(gap, i + 1)));
}

/** Register the gaps subcommand on the CLI program. */
export function registerGapsCommand(program: Command): void {
  program
    .command("gaps")
    .description("Find silent periods where nothing was logged")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--min-gap <duration>", "minimum silence to report (30s, 5m, 2h)", "5m")
    .action(async (files: string[], options: GapsOptions) => {
      try {
        await gapsCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
