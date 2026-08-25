import type { Command } from "commander";
import chalk from "chalk";
import { parseLog } from "../parser/index.js";
import { parsePlainLine, unknownEntry } from "../parser/plain.js";
import { parseJsonLine } from "../parser/json.js";
import { followLines } from "../tailer.js";
import type { LogEntry } from "../types.js";
import { formatEntry } from "../format.js";

export interface TailOptions {
  /** Start by showing the last N existing lines (tail -n behavior). */
  n?: string;
  /** Poll interval in milliseconds. */
  pollMs?: string;
  /** Alert when ≥ N ERROR entries arrive within any rolling 60s window. */
  alertRate?: string;
}

const DEFAULT_BACKREAD_LINES = 10;
const ALERT_WINDOW_MS = 60_000;
const ALERT_COOLDOWN_MS = 60_000;

/** Parse one freshly-arrived line, trying both formats before giving up. */
export function parseArrivedLine(raw: string, line: number): LogEntry {
  const parsed = parsePlainLine(raw) ?? parseJsonLine(raw);
  if (parsed) return { ...parsed, line };
  return unknownEntry(raw, line);
}

/**
 * `logscope tail <file>` — follow a file like `tail -f`, parsing and
 * color-coding each line as it lands. Detects truncation/rotation and keeps
 * counters; optional ERROR-rate spike alerts.
 */
export async function tailCommand(file: string, options: TailOptions): Promise<void> {
  // Fail fast with the friendly reader error if the file doesn't exist yet.
  const initial = await readInitial(file);
  const backLines = clampInt(options.n, DEFAULT_BACKREAD_LINES, 0, 10_000);
  const pollMs = clampInt(options.pollMs, 250, 50, 5_000);
  const alertThreshold = options.alertRate
    ? clampInt(options.alertRate, Number.MAX_SAFE_INTEGER, 1, Number.MAX_SAFE_INTEGER)
    : null;

  console.log(chalk.dim(`── tailing ${file} (ctrl+c to stop) ──`));

  for (const entry of initial.entries.slice(-backLines)) {
    console.log(formatEntry(entry));
  }

  let errorCount = 0;
  let warnCount = 0;
  let seenCount = 0;
  const recentErrorTimes: number[] = [];
  let lastAlertAt = 0;

  process.on("SIGINT", () => {
    console.log(
      chalk.dim(
        `\n── stopped · ${seenCount} new lines · ${errorCount} errors · ${warnCount} warnings ──`,
      ),
    );
    process.exit(0);
  });

  for await (const { line, text } of followLines(file, {
    pollMs,
    startLine: initial.entries.length,
  })) {
    if (text === "__TRUNCATED__") {
      console.log(chalk.yellow("⟳ file truncated/rotated, re-reading from start"));
      continue;
    }
    const entry = parseArrivedLine(text, line);
    console.log(formatEntry(entry));
    seenCount += 1;
    if (entry.level === "ERROR") {
      errorCount += 1;
      recentErrorTimes.push(Date.now());
    } else if (entry.level === "WARN") {
      warnCount += 1;
    }

    // Rolling ERROR-rate spike detection.
    if (alertThreshold !== null && recentErrorTimes.length > 0) {
      const now = Date.now();
      while (recentErrorTimes.length > 0 && now - recentErrorTimes[0]! > ALERT_WINDOW_MS) {
        recentErrorTimes.shift();
      }
      if (recentErrorTimes.length >= alertThreshold && now - lastAlertAt >= ALERT_COOLDOWN_MS) {
        lastAlertAt = now;
        console.log(
          chalk.bgRed.white.bold(
            ` ⚠ ALERT: ${recentErrorTimes.length} errors in the last 60s (threshold ${alertThreshold}) `,
          ),
        );
      }
    }
  }
}

async function readInitial(path: string) {
  try {
    return parseLog(await Bun.file(path).text());
  } catch {
    throw new Error(`file not found: ${path}`);
  }
}

function clampInt(value: string | undefined, fallback: number, min: number, max: number): number {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

/** Register the tail subcommand on the CLI program. */
export function registerTailCommand(program: Command): void {
  program
    .command("tail")
    .description("Follow a log file live, parsing and color-coding as lines arrive")
    .argument("<file>", "path to the log file")
    .option("-n <lines>", "show the last N existing lines before following", "10")
    .option("--poll-ms <ms>", "poll interval in milliseconds", "250")
    .option(
      "--alert-rate <count>",
      "alert when this many ERRORs arrive within a rolling 60s window",
    )
    .action(async (file: string, options: TailOptions) => {
      try {
        await tailCommand(file, options);
      } catch (error) {
        console.error(chalk.red(`error:`), error instanceof Error ? error.message : error);
        process.exitCode = 1;
      }
    });
}
