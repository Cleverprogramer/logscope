import chalk from "chalk";

/**
 * Decide once per call whether ANSI color is appropriate. Honors, in order:
 *   NO_COLOR (https://no-color.org) — any non-empty value disables
 *   FORCE_COLOR     — "0" disables, anything else forces on even when piped
 *   TTY detection   — colors only by default for real terminals
 */
export function colorEnabled(): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR !== undefined) {
    return process.env.FORCE_COLOR !== "0";
  }
  return process.stdout.isTTY === true;
}

/**
 * A chalk-shaped stand-in that renders plain text. Proxy chains mirror
 * chalk's composable API (`bgRed.white.bold(...)`) so formatters can swap
 * implementations without touching call sites.
 */
function plainChalk(): any {
  const fn: any = (value: unknown) => String(value);
  return new Proxy(fn, { get: (_t, prop) => (prop === Symbol.toPrimitive ? () => "" : plainChalk()) });
}

/** The active renderer: chalk when colors are enabled, a no-op otherwise. */
export function painter() {
  if (!colorEnabled()) return plainChalk();
  // chalk snapshots its support level at import time; re-assert it so
  // FORCE_COLOR can revive color on pipes/CI where TTY detection failed.
  chalk.level = Math.max(chalk.level, 1) as typeof chalk.level;
  return chalk;
}
