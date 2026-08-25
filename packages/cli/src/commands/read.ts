import chalk from "chalk";
import type { Command } from "commander";
import { applyFilter, type LevelFilterOptions } from "../filter.js";
import { formatEntry, formatGroups, formatSummary } from "../format.js";
import { groupEntries } from "../grouping/index.js";
import { readLogFile } from "../reader.js";

export interface ReadOptions extends LevelFilterOptions {
  /** Suppress the trailing summary line. */
  quiet?: boolean;
  /** Show the top N most frequent message groups after the entries. */
  top?: string;
}

/** `logscope read <file>` — parse a file and print color-coded entries. */
export async function readCommand(file: string, options: ReadOptions): Promise<void> {
  const result = await readLogFile(file);

  // Filters are applied to parsed output; unparsed lines only survive when no
  // level filter excludes UNKNOWN.
  const filtered = applyFilter(result.entries, options);

  for (const entry of filtered) {
    console.log(formatEntry(entry));
  }

  if (!options.quiet) {
    console.log(
      formatSummary({
        totalLines: filtered.length,
        unparsedLines: filtered.filter((e) => e.unparsed).length,
      }),
    );
  }

  if (options.top !== undefined) {
    const topN = Number.parseInt(options.top ?? "10", 10);
    if (Number.isNaN(topN) || topN < 0) {
      throw new Error(`Invalid --top value "${options.top}". Use a non-negative number.`);
    }
    const groups = groupEntries(filtered);
    if (groups.length > 0) {
      console.log(chalk.dim(`\n── top ${Math.min(topN, groups.length)} message group(s) ──`));
      for (const line of formatGroups(groups, topN)) console.log(line);
    }
  }
}

/** Register the read subcommand on the CLI program. */
export function registerReadCommand(program: Command): void {
  program
    .command("read")
    .description("Parse a log file and print color-coded, structured entries")
    .argument("<file>", "path to the log file, or \"-\" for stdin")
    .option("--level <levels>", 'filter by level(s), e.g. "error" or "error,warn"')
    .option("--grep <pattern>", "filter by text/regex match on message")
    .option(
      "--since <when>",
      'only entries after this time: "30s", "5m", "2h", "7d" or an ISO date',
    )
    .option("-q, --quiet", "hide the summary line")
    .option("-t, --top <n>", "show the N most frequent message groups", "10")
    .action(async (file: string, options: ReadOptions) => {
      try {
        await readCommand(file, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
