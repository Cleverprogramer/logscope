import type { Command } from "commander";
import { painter } from "../color.js";
import { applyConfigDefaults, getConfig } from "../config.js";
import { applyFilter, type LevelFilterOptions } from "../filter.js";
import { assertTimeZone, formatEntry, formatEntryJson, formatGroups, formatSummary } from "../format.js";
import { groupEntries } from "../grouping/index.js";
import { readLogFiles } from "../reader.js";
import { setAsciiMode } from "../symbols.js";

export interface ReadOptions extends LevelFilterOptions {
  /** Suppress the trailing summary line. */
  quiet?: boolean;
  /** Show the top N most frequent message groups after the entries. */
  top?: string;
  /** IANA timezone for displayed timestamps, e.g. America/New_York. */
  tz?: string;
  /** Output format: human "text" (default) or machine "jsonl". */
  out?: string;
  /** Custom line template, e.g. "{timestamp} [{level}] {message}". */
  format?: string;
  compact?: boolean;
  verbose?: boolean;
  ascii?: boolean;
  icons?: boolean;
}

/** `logscope read <files...>` — parse file(s)/globs/stdin and print entries. */
export async function readCommand(files: string[], options: ReadOptions): Promise<void> {
  options = applyConfigDefaults(options, getConfig());
  setAsciiMode(options.ascii);
  if (options.compact && options.verbose) throw new Error("Options --compact and --verbose cannot be used together.");
  const tz = options.tz ? assertTimeZone(options.tz) : undefined;
  const jsonl = options.out === "jsonl";
  if (options.out && options.out !== "jsonl" && options.out !== "text") {
    throw new Error(`Invalid --out "${options.out}". Use "text" or "jsonl".`);
  }
  const result = await readLogFiles(files, {
    formatTemplate: options.format,
  });
  const showSource = result.entries.some((e) => e.source !== undefined);

  // Filters are applied to parsed output; unparsed lines only survive when no
  // level filter excludes UNKNOWN.
  const filtered = applyFilter(result.entries, options);

  for (const entry of filtered) {
    console.log(jsonl ? formatEntryJson(entry) : formatEntry(entry, tz, { showSource, icons: options.icons, mode: options.compact ? "compact" : options.verbose ? "verbose" : undefined }));
  }

  if (!options.quiet && !jsonl) {
    console.log(
      formatSummary({
        totalLines: filtered.length,
        unparsedLines: filtered.filter((e) => e.unparsed).length,
      }),
    );
  }

  if (options.top !== undefined && !jsonl) {
    const topN = Number.parseInt(options.top ?? "10", 10);
    if (Number.isNaN(topN) || topN < 0) {
      throw new Error(`Invalid --top value "${options.top}". Use a non-negative number.`);
    }
    const groups = groupEntries(filtered);
    if (groups.length > 0) {
      console.log(painter().dim(`\n── top ${Math.min(topN, groups.length)} message group(s) ──`));
      for (const line of formatGroups(groups, topN)) console.log(line);
    }
  }
}

/** Register the read subcommand on the CLI program. */
export function registerReadCommand(program: Command): void {
  program
    .command("read")
    .description("Parse log file(s) — paths, globs or \"-\" for stdin")
    .argument("<files...>", "log file paths or glob patterns; \"-\" for stdin")
    .option("--level <levels>", 'filter by level(s), e.g. "error" or "error,warn"')
    .option("--grep <pattern>", "filter by text/regex match on message")
    .option(
      "--since <when>",
      'only entries after this time: "30s", "5m", "2h", "7d" or an ISO date',
    )
    .option("--tz <zone>", "display timestamps in an IANA timezone, e.g. America/New_York")
    .option("--out <format>", 'output format: "text" (default) or "jsonl"')
    .option(
      "--format <template>",
      'custom line template, e.g. "{timestamp} [{level}] {message}"',
    )
    .option("-q, --quiet", "hide the summary line")
    .option("-t, --top <n>", "show the N most frequent message groups", "10")
    .option("--compact", "minimal one-line human output")
    .option("--verbose", "include full metadata and multiline details")
    .option("--ascii", "use ASCII-only symbols")
    .option("--icons", "prefix levels with semantic icons")
    .action(async (files: string[], options: ReadOptions) => {
      try {
        await readCommand(files, options);
      } catch (error) {
        console.error(painter().red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
