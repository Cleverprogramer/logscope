import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { parseDurationMs } from "../filter.js";
import { detectSpikes } from "../analysis/anomalies.js";

export interface SpikesOptions {
  /** Bucket width, e.g. "1m". */
  bucket?: string;
  /** Robust z-score threshold. */
  sensitivity?: string;
  /** Which level to watch (defaults to errors). */
  level?: string;
}

/**
 * `logscope spikes <files>` — flag statistically anomalous bursts.
 */
export async function spikesCommand(files: string[], options: SpikesOptions): Promise<void> {
  const bucketMs = options.bucket ? parseDurationMs(options.bucket) : 60_000;
  if (!bucketMs) {
    throw new Error(`Invalid --bucket "${options.bucket}". Use durations like 10s, 1m, 5m.`);
  }
  const sensitivity = Number.parseFloat(options.sensitivity ?? "3");
  if (Number.isNaN(sensitivity) || sensitivity <= 0) {
    throw new Error(`Invalid --sensitivity "${options.sensitivity}". Use a positive number.`);
  }

  const result = await readLogFiles(files);
  const wanted = (options.level ?? "error").toUpperCase();
  const times = result.entries
    .filter((e) => e.level === wanted && e.timestamp)
    .map((e) => e.timestamp!.getTime());

  console.log(chalk.bold.underline(`logscope spikes — ${files.join(", ")}`));
  console.log(chalk.dim(`${times.length} ${wanted} entries · ${bucketMs / 1000}s buckets · z ≥ ${sensitivity}\n`));

  const spikes = detectSpikes(times, bucketMs, sensitivity);
  if (spikes.length === 0) {
    console.log(chalk.green("✓ no anomalous buckets detected"));
    return;
  }

  for (const spike of spikes) {
    const fmt = (d: Date) => d.toISOString().replace("T", " ").slice(0, 19);
    console.log(
      `${painter().red("▲")} ${fmt(spike.from)} → ${fmt(spike.to)}  ` +
        `${painter().bold(String(spike.count))} events  ` +
        painter().dim(`z=${spike.score}`),
    );
  }
}

/** Register the spikes subcommand on the CLI program. */
export function registerSpikesCommand(program: Command): void {
  program
    .command("spikes")
    .description("Detect statistical error-rate anomalies over time")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--bucket <duration>", "bucket width (10s, 1m, 5m)", "1m")
    .option("--sensitivity <z>", "robust z-score threshold", "3")
    .option("--level <level>", "which level to watch", "error")
    .action(async (files: string[], options: SpikesOptions) => {
      try {
        await spikesCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
