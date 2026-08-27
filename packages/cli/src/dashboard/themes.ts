import type { LogLevel } from "../types.js";

export interface DashboardTheme {
  name: string;
  levels: Record<LogLevel, string>;
  accent: string;
  border: string;
}
export type ThemeColorOverrides = Partial<Record<"error" | "warn" | "info" | "debug" | "unknown" | "accent" | "border", string>>;

const base = { ERROR: "red", WARN: "yellow", INFO: "blue", DEBUG: "gray", UNKNOWN: "magenta" } as Record<LogLevel, string>;

export const THEMES: Record<string, DashboardTheme> = {
  default: { name: "default", levels: base, accent: "cyan", border: "gray" },
  dracula: { name: "dracula", levels: { ERROR: "red", WARN: "yellow", INFO: "magenta", DEBUG: "gray", UNKNOWN: "cyan" }, accent: "magenta", border: "magenta" },
  solarized: { name: "solarized", levels: { ERROR: "red", WARN: "yellow", INFO: "cyan", DEBUG: "blue", UNKNOWN: "magenta" }, accent: "cyan", border: "blue" },
  monokai: { name: "monokai", levels: { ERROR: "red", WARN: "yellow", INFO: "green", DEBUG: "gray", UNKNOWN: "magenta" }, accent: "green", border: "green" },
  nord: { name: "nord", levels: { ERROR: "red", WARN: "yellow", INFO: "cyan", DEBUG: "blue", UNKNOWN: "magenta" }, accent: "cyan", border: "blue" },
};

export function getTheme(name = "default", overrides: ThemeColorOverrides = {}): DashboardTheme {
  const theme = THEMES[name.toLowerCase()];
  if (!theme) throw new Error(`Unknown theme "${name}". Choose ${Object.keys(THEMES).join(", ")}.`);
  return {
    ...theme,
    levels: {
      ...theme.levels,
      ...(overrides.error ? { ERROR: overrides.error } : {}),
      ...(overrides.warn ? { WARN: overrides.warn } : {}),
      ...(overrides.info ? { INFO: overrides.info } : {}),
      ...(overrides.debug ? { DEBUG: overrides.debug } : {}),
      ...(overrides.unknown ? { UNKNOWN: overrides.unknown } : {}),
    },
    accent: overrides.accent ?? theme.accent,
    border: overrides.border ?? theme.border,
  };
}
