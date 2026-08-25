import type { Command } from "commander";
import chalk from "chalk";
import { painter } from "../color.js";
import { readLogFiles } from "../reader.js";
import { groupEntries } from "../grouping/index.js";
import { matchKnowledge } from "../analysis/kb.js";

export interface AdviseOptions {
  /** Max groups to consider. */
  top?: string;
}

const CATEGORY_COLORS = {
  network: "cyan",
  disk: "yellow",
  memory: "magenta",
  config: "blue",
  auth: "red",
  process: "green",
  data: "white",
} as const;

/**
 * `logscope advise <files>` — match the most frequent error groups against
 * the offline knowledge base and print targeted suggestions.
 */
export async function adviseCommand(files: string[], options: AdviseOptions): Promise<void> {
  const result = await readLogFiles(files);
  const groups = groupEntries(result.entries).filter((g) => g.level === "ERROR");
  const topN = Math.max(1, Number.parseInt(options.top ?? "10", 10) || 10);

  console.log(chalk.bold.underline(`logscope advise — ${files.join(", ")}`));
  console.log();

  let advised = 0;
  for (const group of groups.slice(0, topN)) {
    const hits = matchKnowledge(`${group.sample} ${group.signature}`);
    if (hits.length === 0) continue;
    advised++;
    for (const rule of hits) {
      const color = CATEGORY_COLORS[rule.category];
      console.log(
        `${painter()[color](`[${rule.category}]`)} ${painter().bold(`×${group.count}`)} ${group.sample}`,
      );
      console.log(painter().dim(`   ↳ ${rule.hint}`));
    }
  }

  if (advised === 0) {
    console.log(chalk.dim("no knowledge-base matches in the top error groups"));
  }
}

/** Register the advise subcommand on the CLI program. */
export function registerAdviseCommand(program: Command): void {
  program
    .command("advise")
    .description("Match frequent errors against an offline known-error knowledge base")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("--top <n>", "max groups to consider", "10")
    .action(async (files: string[], options: AdviseOptions) => {
      try {
        await adviseCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
