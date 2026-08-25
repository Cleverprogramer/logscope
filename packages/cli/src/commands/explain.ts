import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { makeFilter, type LevelFilterOptions } from "../filter.js";
import { formatTimestamp } from "../format.js";
import { selectContextWindows, type ContextWindow } from "../analysis/context.js";
import type { LogEntry } from "../types.js";

export interface ExplainOptions extends LevelFilterOptions {
  /** Context lines before each match. */
  before?: string;
  /** Context lines after each match. */
  after?: string;
}

function renderLine(entry: LogEntry | undefined, isTarget: boolean): string {
  if (!entry) return "";
  const p = painter();
  const marker = isTarget ? p.red("▶") : p.dim(" ");
  const lineNo = p.dim(String((entry.line ?? 0) + 1).padStart(5));
  const ts = formatTimestamp(entry.timestamp);
  return `${marker} ${lineNo} ${ts} ${p[entry.level === "ERROR" ? "red" : entry.level === "WARN" ? "yellow" : "blue"](entry.level.padEnd(7))} ${entry.message}`;
}

/**
 * `logscope explain <files>` — print context windows around every matched
 * entry so causes are visible alongside effects.
 */
export async function explainCommand(files: string[], options: ExplainOptions): Promise<void> {
  const before = Math.max(0, Number.parseInt(options.before ?? "10", 10) || 10);
  const after = Math.max(0, Number.parseInt(options.after ?? "2", 10) || 2);

  const result = await readLogFiles(files);
  // Default target filter: errors (and warns when no explicit level given).
  const matches = makeFilter(options.level || options.grep ? options : { grep: options.grep });
  const isTarget = options.level || options.grep
    ? matches
    : (e: LogEntry) => e.level === "ERROR";

  console.log(chalk.bold.underline(`logscope explain — ${files.join(", ")}`));
  console.log(chalk.dim(`context: ${before} before / ${after} after\n`));

  const windows: ContextWindow[] = selectContextWindows(result.entries, isTarget, before, after);
  if (windows.length === 0) {
    console.log(chalk.dim("no matching entries to explain"));
    return;
  }

  for (const window of windows) {
    for (let i = window.start; i <= window.end; i++) {
      console.log(renderLine(result.entries[i], window.targets.includes(i)));
    }
    console.log(chalk.dim("─".repeat(60)));
  }
  console.log(chalk.dim(`${windows.length} context window(s)`));
}

/** Register the explain subcommand on the CLI program. */
export function registerExplainCommand(program: Command): void {
  program
    .command("explain")
    .description("Show context lines around every matched entry")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--level <levels>", 'which entries to explain (default: error)')
    .option("--grep <pattern>", "explain entries matching a pattern instead")
    .option("--before <n>", "context lines before each match", "10")
    .option("--after <n>", "context lines after each match", "2")
    .action(async (files: string[], options: ExplainOptions) => {
      try {
        await explainCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
