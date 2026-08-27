import type { Command } from "commander";
import chalk from "chalk";
import { readLogFiles } from "../reader.js";
import { parseDurationMs } from "../filter.js";
import { correlateSequence } from "../analysis/sequences.js";

export interface CorrelateOptions {
  before: string;
  after: string;
  window?: string;
  json?: boolean;
}

function compilePattern(value: string, name: string): RegExp {
  try {
    return new RegExp(value, "i");
  } catch (error) {
    throw new Error(`Invalid --${name} regex: ${error instanceof Error ? error.message : error}`);
  }
}

/** `logscope correlate` — measure an ordered, time-bounded log relationship. */
export async function correlateCommand(files: string[], options: CorrelateOptions): Promise<void> {
  const windowMs = parseDurationMs(options.window ?? "5m");
  if (!windowMs) throw new Error(`Invalid --window "${options.window}". Use 10s, 5m, or 1h.`);

  const result = await readLogFiles(files);
  const correlation = correlateSequence(
    result.entries,
    compilePattern(options.before, "before"),
    compilePattern(options.after, "after"),
    windowMs,
  );

  if (options.json) {
    console.log(JSON.stringify({
      before: options.before,
      after: options.after,
      windowMs,
      beforeCount: correlation.beforeCount,
      correlatedCount: correlation.correlatedCount,
      rate: correlation.rate,
      pairs: correlation.pairs.map((pair) => ({
        beforeLine: pair.before.line,
        afterLine: pair.after.line,
        delayMs: pair.delayMs,
      })),
    }, null, 2));
    return;
  }

  console.log(chalk.bold.underline(`logscope correlate — ${files.join(", ")}`));
  console.log(chalk.dim(`/${options.before}/ → /${options.after}/ within ${options.window ?? "5m"}\n`));
  if (correlation.beforeCount === 0) {
    console.log(chalk.yellow("no timestamped entries matched the before pattern"));
    return;
  }
  const percent = (correlation.rate * 100).toFixed(1);
  console.log(`${chalk.bold(String(correlation.correlatedCount))}/${correlation.beforeCount} sequences correlated (${percent}%)`);
  for (const pair of correlation.pairs.slice(0, 20)) {
    console.log(chalk.dim(`  line ${pair.before.line} → ${pair.after.line} (${pair.delayMs}ms)`));
  }
  if (correlation.pairs.length > 20) console.log(chalk.dim(`  … ${correlation.pairs.length - 20} more`));
}

export function registerCorrelateCommand(program: Command): void {
  program
    .command("correlate")
    .description("Measure whether one log pattern precedes another")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .requiredOption("--before <pattern>", "regex for the preceding event")
    .requiredOption("--after <pattern>", "regex for the following event")
    .option("--window <duration>", "maximum delay between events (10s, 5m, 1h)", "5m")
    .option("--json", "output machine-readable JSON")
    .action(async (files: string[], options: CorrelateOptions) => {
      try {
        await correlateCommand(files, options);
      } catch (error) {
        console.error(chalk.red("error:"), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
