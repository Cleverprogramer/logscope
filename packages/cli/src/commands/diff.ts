import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { groupEntries } from "../grouping/index.js";
import { diffGroups } from "../analysis/diff.js";

export interface DiffOptions {
  /** Only compare groups at this level (default: all). */
  level?: string;
}

function section(title: string, color: "red" | "green" | "yellow", rows: string[]): void {
  if (rows.length === 0) return;
  console.log(painter()[color].bold(`${title} (${rows.length})`));
  for (const row of rows) console.log(`  ${row}`);
}

/**
 * `logscope diff <before> <after>` — what changed between two log sets.
 */
export async function diffCommand(files: string[], options: DiffOptions): Promise<void> {
  if (files.length !== 2) {
    throw new Error("diff needs exactly two files: logscope diff BEFORE AFTER");
  }
  const [beforeResult, afterResult] = await Promise.all([
    readLogFiles([files[0]!]),
    readLogFiles([files[1]!]),
  ]);

  const filterLevel = options.level?.toUpperCase();
  const beforeGroups = groupEntries(beforeResult.entries).filter(
    (g) => !filterLevel || g.level === filterLevel,
  );
  const afterGroups = groupEntries(afterResult.entries).filter(
    (g) => !filterLevel || g.level === filterLevel,
  );

  const diff = diffGroups(beforeGroups, afterGroups);

  console.log(chalk.bold.underline(`logscope diff — ${files[0]} vs ${files[1]}\n`));
  section("added", "red", diff.added.map((g) => `+ ×${g.count} [${g.level}] ${g.sample}`));
  section("resolved", "green", diff.resolved.map((g) => `- ×${g.count} [${g.level}] ${g.sample}`));
  section(
    "changed",
    "yellow",
    diff.changed.map(
      (c) => `~ ${c.before}→${c.after}${c.delta > 0 ? "+" : ""}[${c.level}] ${c.sample}`,
    ),
  );
  if (diff.added.length + diff.resolved.length + diff.changed.length === 0) {
    console.log(chalk.green("✓ identical error/warning profiles"));
  }
}

/** Register the diff subcommand on the CLI program. */
export function registerDiffCommand(program: Command): void {
  program
    .command("diff")
    .description("Compare message groups between two log files (e.g. before/after deploy)")
    .argument("<before>", "baseline log file")
    .argument("<after>", "comparison log file")
    .option("--level <level>", "only compare this level, e.g. ERROR")
    .action(async (before: string, after: string, options: DiffOptions) => {
      try {
        await diffCommand([before, after], options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
