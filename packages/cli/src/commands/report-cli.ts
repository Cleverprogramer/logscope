import type { Command } from "commander";
import chalk from "chalk";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { computeStats } from "./stats.js";
import { renderHtmlReport, renderMarkdownReport, type ReportOptions } from "./report.js";

export interface ReportCommandOptions extends ReportOptions {
  /** Output path (.html default, .md for markdown). */
  o?: string;
  md?: boolean;
}

/**
 * `logscope report <files> -o out.html` — write a shareable report.
 */
export async function reportCommand(
  files: string[],
  options: ReportCommandOptions,
): Promise<void> {
  const report = await computeStats(files, options);
  const markdown = Boolean(options.md) || (options.o?.endsWith(".md") ?? false);
  const title = files.join(", ");

  const content = markdown
    ? renderMarkdownReport(title, report)
    : renderHtmlReport(title, report);

  if (!options.o) {
    process.stdout.write(content);
    return;
  }
  await mkdir(dirname(options.o), { recursive: true });
  await writeFile(options.o, content, "utf8");
  console.log(chalk.green(`✓ wrote ${options.o} (${content.length} bytes)`));
}

export function registerReportCommand(program: Command): void {
  program
    .command("report")
    .description("Generate a self-contained HTML or Markdown report")
    .argument("<files...>", 'log file paths or glob patterns; "-" for stdin')
    .option("-o <path>", "output file (default: stdout)")
    .option("--md", "render Markdown instead of HTML")
    .option("--level <levels>", 'filter by level(s), e.g. "error,warn"')
    .option("--since <when>", 'only include entries after this time ("30s", "2h", ISO date)')
    .option("--top <n>", "max message groups to show", "10")
    .action(async (files: string[], options: ReportCommandOptions) => {
      try {
        await reportCommand(files, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
