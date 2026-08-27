import type { Command } from "commander";
import chalk from "chalk";
import React from "react";
import { render } from "ink";
import { Dashboard } from "../dashboard/Dashboard.js";
import { parseLog } from "../parser/index.js";
import { followLines } from "../tailer.js";
import { parseSince } from "../filter.js";
import { parseArrivedLine } from "./tail.js";
import { getTheme, type DashboardTheme } from "../dashboard/themes.js";

export interface DashboardOptions {
  level?: string;
  since?: string;
  grep?: string;
  theme?: string;
}

const LEVEL_ALIASES = ["error", "warn", "warning", "info", "debug", "unknown"];

/**
 * `logscope dashboard <file>` — live-updating full-screen terminal UI.
 * Loads the file, applies filters, then follows appends and re-renders as
 * new lines land.
 */
export async function dashboardCommand(file: string, options: DashboardOptions): Promise<void> {
  let content: string;
  try {
    content = await Bun.file(file).text();
  } catch {
    throw new Error(`file not found: ${file}`);
  }

  const activeFilters: string[] = [];
  const theme: DashboardTheme = getTheme(options.theme);
  activeFilters.push(`theme=${theme.name}`);
  const levelsWanted = options.level
    ? new Set(
        options.level
          .split(",")
          .map((l) => l.trim().toLowerCase())
          .filter((l) => LEVEL_ALIASES.includes(l)),
      )
    : null;
  if (levelsWanted) activeFilters.push(`level=${options.level}`);
  if (options.grep) {
    activeFilters.push(`grep=${options.grep}`);
    if (!grepRegexSafe(options.grep)) {
      throw new Error(`Invalid --grep pattern: ${options.grep}`);
    }
  }
  if (options.since) activeFilters.push(`since=${options.since}`);

  const grepRegex = options.grep ? new RegExp(options.grep, "i") : null;
  const sinceCutoff = options.since ? parseSince(options.since) : null;

  const matches = (entry: { level: string; message: string; raw: string; timestamp: Date | null }) => {
    if (levelsWanted && !levelsWanted.has(entry.level.toLowerCase())) return false;
    if (grepRegex && !(grepRegex.test(entry.message) || grepRegex.test(entry.raw))) return false;
    if (sinceCutoff && (!entry.timestamp || entry.timestamp < sinceCutoff)) return false;
    return true;
  };

  let entries = parseLog(content).entries.filter(matches);

  const instance = render(
    <Dashboard file={file} entries={entries} activeFilters={activeFilters} theme={theme} />,
    { exitOnCtrlC: true },
  );

  let nextLine = entries.length > 0 ? entries[entries.length - 1]!.line + 1 : 0;
  const controller = new AbortController();

  const follow = (async () => {
    try {
      for await (const { line, text } of followLines(file, {
        pollMs: 250,
        startLine: nextLine,
        signal: controller.signal,
      })) {
        if (text === "__TRUNCATED__") continue;
        const entry = parseArrivedLine(text, line);
        if (!matches(entry)) continue;
        entries = [...entries, entry];
        instance.rerender(
          <Dashboard file={file} entries={entries} activeFilters={activeFilters} theme={theme} />,
        );
      }
    } catch {
      // File vanished mid-follow — leave the last rendered state up.
    }
  })();

  await instance.waitUntilExit();
  controller.abort();
  await follow;
}

function grepRegexSafe(pattern: string): boolean {
  try {
    new RegExp(pattern, "i");
    return true;
  } catch {
    return false;
  }
}

/** Register the dashboard subcommand on the CLI program. */
export function registerDashboardCommand(program: Command): void {
  program
    .command("dashboard")
    .description("Open the live-updating terminal dashboard for a log file")
    .argument("<file>", "path to the log file")
    .option("--level <levels>", 'filter by level(s), e.g. "error,warn"')
    .option("--since <when>", 'only include entries after this time ("30s", "2h", ISO date)')
    .option("--grep <pattern>", "filter by text/regex match")
    .option("--theme <name>", "color theme: default, dracula, solarized, monokai, nord", "default")
    .action(async (file: string, options: DashboardOptions) => {
      try {
        await dashboardCommand(file, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
