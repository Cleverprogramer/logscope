import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ThemeColorOverrides } from "./dashboard/themes.js";
import type { DashboardPanel } from "./dashboard/layout.js";

/** Keys a .logscoperc may set — they map onto CLI option names. */
export interface LogscopeConfig {
  level?: string;
  grep?: string;
  since?: string;
  top?: string;
  tz?: string;
  interval?: string;
  out?: string;
  theme?: string;
  colors?: ThemeColorOverrides;
  dashboard?: { panels?: DashboardPanel[] };
}

const CONFIG_FILENAME = ".logscoperc";

function readConfigFile(path: string): LogscopeConfig | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") return null;
    throw new Error(`could not read ${path}: ${(error as Error).message}`);
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    // Keep only known, string-valued keys.
    const config: LogscopeConfig = {};
    for (const key of Object.keys(parsed) as Array<keyof LogscopeConfig>) {
      const value = parsed[key];
      if (typeof value === "string") config[key] = value;
      if (key === "colors" && value && typeof value === "object" && !Array.isArray(value)) {
        config.colors = {};
        for (const [color, raw] of Object.entries(value)) {
          if (typeof raw === "string") config.colors[color as keyof ThemeColorOverrides] = raw;
        }
      }
      if (key === "dashboard" && value && typeof value === "object" && !Array.isArray(value)) {
        const panels = (value as { panels?: unknown }).panels;
        if (Array.isArray(panels) && panels.every((panel) => typeof panel === "string")) {
          config.dashboard = { panels: panels as DashboardPanel[] };
        }
      }
    }
    return config;
  } catch {
    throw new Error(`invalid ${CONFIG_FILENAME} at ${path}: not valid JSON`);
  }
}

/**
 * Load configuration with cwd precedence over the home directory.
 * Missing files are fine; malformed ones are a hard error.
 */
export function loadConfig(cwd = process.cwd(), home = process.env.HOME): LogscopeConfig {
  const fromHome = home ? readConfigFile(join(home, CONFIG_FILENAME)) : null;
  const fromCwd = readConfigFile(join(cwd, CONFIG_FILENAME));
  return { ...fromHome, ...fromCwd };
}

/**
 * Fill unset CLI options from the config. Explicit flags always win —
 * only `undefined` values get replaced.
 */
export function applyConfigDefaults<T extends object>(options: T, config: LogscopeConfig): T {
  const merged = { ...options } as Record<string, unknown>;
  for (const [key, value] of Object.entries(config)) {
    if (merged[key] === undefined && value !== undefined) merged[key] = value;
  }
  return merged as T;
}

let cached: LogscopeConfig | null = null;

/** Memoized loader used by command actions to pull project defaults. */
export function getConfig(): LogscopeConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
