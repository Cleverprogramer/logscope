import type { Command } from "commander";
import chalk from "chalk";
import { parseDurationMs } from "../filter.js";
import { readLogFiles } from "../reader.js";
import {
  computeHeatmap,
  renderHeatmap,
  type HeatmapBucket,
} from "../analysis/heatmap.js";

export interface HeatmapOptions {
  /** Bucket width, e.g. "10s", "1m", "5m". */
  bucket?: string;
  json?: boolean;
  ascii?: boolean;
  exclude?: string[];
}

/**
 * `logscope heatmap <files>` — activity over time as per-bucket bars,
 * including silent buckets so gaps and bursts are visible at a glance.
 */
export async function heatmapCommand(files: string[], options: HeatmapOptions): Promise<void> {
  const bucketMs = parseDurationMs(options.bucket ?? "1m");
  if (!bucketMs) {
    throw new Error(`Invalid --bucket "${options.bucket}". Use durations like 10s, 1m, 5m.`);
  }

  const result = await readLogFiles(files, { exclude: options.exclude });
  const buckets = computeHeatmap(result.entries, bucketMs);

  if (options.json) {
    console.log(JSON.stringify({ bucketMs, buckets: serializeBuckets(buckets) }, null, 2));
    return;
  }

  if (buckets.length === 0) {
    console.log(chalk.dim("no timestamped entries — nothing to plot"));
    return;
  }

  const title = files.join(", ");
  const span = `${buckets[0]!.from.toISOString().slice(0, 19).replace("T", " ")} → ${buckets[buckets.length - 1]!.to.toISOString().slice(0, 19).replace("T", " ")}`;
  console.log(chalk.bold.underline(`logscope heatmap — ${title}`));
  console.log(chalk.dim(`bucket ${options.bucket ?? "1m"} · ${buckets.length} buckets · ${span}\n`));
  for (const line of renderHeatmap(buckets, { ascii: options.ascii })) {
    console.log(line);
  }
  const busiest = buckets.reduce((a, b) => (b.total > a.total ? b : a));
  console.log(
    chalk.dim(`\nbusiest bucket ${busiest.total} entries · errors ${busiest.counts.ERROR} · bar scaled to max`),
  );
}

function serializeBuckets(buckets: HeatmapBucket[]): Array<{
  from: string;
  to: string;
  counts: HeatmapBucket["counts"];
  total: number;
}> {
  return buckets.map((bucket) => ({
    from: bucket.from.toISOString(),
    to: bucket.to.toISOString(),
    counts: { ...bucket.counts },
    total: bucket.total,
  }));
}

/** Register the heatmap subcommand on the CLI program. */
export function registerHeatmapCommand(program: Command): void {
  program
    .command("heatmap")
    .description("Plot log activity over time as per-bucket bars")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--bucket <duration>", "bucket width (10s, 1m, 5m)", "1m")
    .option("--json", "output machine-readable JSON")
    .option("--ascii", "use ASCII-only block characters")
    .action(async (files: string[], options: HeatmapOptions) => {
      try {
        await heatmapCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
