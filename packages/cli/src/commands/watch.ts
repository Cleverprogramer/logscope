import type { Command } from "commander";
import chalk from "chalk";
import { renderReport, computeStats, type StatsOptions } from "./stats.js";

export interface WatchOptions extends StatsOptions {
  /** Refresh interval in seconds. */
  interval?: string;
}

const CLEAR_SCREEN = "\x1b[2J\x1b[1;1H";

/**
 * `logscope watch <files>` — re-run the stats report on an interval,
 * clearing the terminal each cycle. Ctrl+C exits.
 */
export async function watchCommand(files: string[], options: WatchOptions): Promise<void> {
  const seconds = Math.max(1, Number.parseInt(options.interval ?? "2", 10) || 2);

  process.on("SIGINT", () => {
    console.log(chalk.dim("\n── watch stopped ──"));
    process.exit(0);
  });

  for (;;) {
    const report = await computeStats(files, options);
    process.stdout.write(CLEAR_SCREEN);
    renderReport(files.join(", "), report);
    console.log(
      chalk.dim(
        `↻ refreshing every ${seconds}s · last update ${new Date().toLocaleTimeString()} · ctrl+c to stop`,
      ),
    );
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }
}

/** Register the watch subcommand on the CLI program. */
export function registerWatchCommand(program: Command): void {
  program
    .command("watch")
    .description("Re-render the stats report on an interval")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--interval <seconds>", "refresh interval in seconds", "2")
    .option("--level <levels>", 'filter by level(s), e.g. "error,warn"')
    .option("--since <when>", 'only include entries after this time ("30s", "2h", ISO date)')
    .option("--top <n>", "max message groups to show", "10")
    .action(async (files: string[], options: WatchOptions) => {
      try {
        await watchCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
