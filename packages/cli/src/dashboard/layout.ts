export const DASHBOARD_PANELS = ["stats", "rate", "groups", "entries"] as const;
export type DashboardPanel = (typeof DASHBOARD_PANELS)[number];

export function resolvePanels(panels?: string[]): DashboardPanel[] {
  if (!panels) return [...DASHBOARD_PANELS];
  const normalized = panels.map((panel) => panel.toLowerCase());
  if (normalized.some((panel) => !(DASHBOARD_PANELS as readonly string[]).includes(panel))) {
    throw new Error(`Unknown dashboard panel. Choose ${DASHBOARD_PANELS.join(", ")}.`);
  }
  if (new Set(normalized).size !== normalized.length) throw new Error("Dashboard panels cannot be duplicated.");
  return normalized as DashboardPanel[];
}
