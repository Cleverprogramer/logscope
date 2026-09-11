import { describe, expect, test } from "bun:test";
import { computeHeatmap, labelFor, renderHeatmap, renderHeatmapRow } from "../src/analysis/heatmap.js";
import type { LogEntry } from "../src/types.js";

const at = (iso: string, level: LogEntry["level"] = "INFO"): LogEntry => ({
  line: 0,
  raw: iso,
  timestamp: new Date(iso),
  level,
  message: "",
  unparsed: false,
});

describe("computeHeatmap", () => {
  test("zero-fills silent buckets and counts per level", () => {
    const entries = [
      at("2026-08-20T09:00:10Z", "INFO"),
      at("2026-08-20T09:00:30Z", "ERROR"),
      // 2-minute silence between the 1-minute buckets
      at("2026-08-20T09:02:20Z", "WARN"),
    ];
    const buckets = computeHeatmap(entries, 60_000);
    expect(buckets).toHaveLength(3);
    expect(buckets[0]!.counts.INFO).toBe(1);
    expect(buckets[0]!.counts.ERROR).toBe(1);
    expect(buckets[0]!.total).toBe(2);
    expect(buckets[1]!.total).toBe(0);
    expect(buckets[2]!.counts.WARN).toBe(1);
    expect(buckets[2]!.from.toISOString()).toBe("2026-08-20T09:02:10.000Z");
  });

  test("handles out-of-order input via min/max span", () => {
    const buckets = computeHeatmap(
      [at("2026-08-20T09:10:00Z"), at("2026-08-20T09:00:00Z")],
      60_000,
    );
    expect(buckets).toHaveLength(11);
    expect(buckets[0]!.total).toBe(1);
    expect(buckets[10]!.total).toBe(1);
  });

  test("single entry yields one bucket", () => {
    const buckets = computeHeatmap([at("2026-08-20T09:00:00Z")], 60_000);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.total).toBe(1);
  });

  test("entries without timestamps are ignored", () => {
    const mixed = [at("2026-08-20T09:00:00Z"), { ...at("2026-08-20T09:00:01Z"), timestamp: null }];
    const buckets = computeHeatmap(mixed, 60_000);
    expect(buckets).toHaveLength(1);
    expect(buckets[0]!.total).toBe(1);
  });

  test("no timestamped entries returns an empty list", () => {
    expect(computeHeatmap([], 60_000)).toHaveLength(0);
    expect(computeHeatmap([{ ...at("2026-08-20T09:00:00Z"), timestamp: null }], 60_000)).toHaveLength(0);
  });

  test("rejects a non-positive bucket width", () => {
    expect(() => computeHeatmap([at("2026-08-20T09:00:00Z")], 0)).toThrow(/positive/);
    expect(() => computeHeatmap([at("2026-08-20T09:00:00Z")], -5)).toThrow(/positive/);
  });
});

describe("renderHeatmap", () => {
  const entries = [
    at("2026-08-20T09:00:10Z", "ERROR"),
    at("2026-08-20T09:00:20Z", "ERROR"),
    at("2026-08-20T09:00:30Z", "INFO"),
    at("2026-08-20T09:01:00Z", "WARN"),
    at("2026-08-20T09:03:00Z", "INFO"),
  ];
  // Buckets anchored at 09:00:10: [4 entries incl. 2 error + 1 warn, 0, 1].
  const buckets = computeHeatmap(entries, 60_000);

  test("bar scales to the busiest bucket and flags error/warn detail", () => {
    const lines = renderHeatmap(buckets, { barWidth: 10 });
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain("09:00");
    expect(lines[0]).toContain("4 entries");
    expect(lines[0]).toContain("(2 error, 1 warn)");
    expect(lines[1]).toContain("0 entries");
    expect(lines[2]).toContain("1 entries");
  });

  test("bars are proportional to totals", () => {
    const lines = renderHeatmap(buckets, { barWidth: 10 });
    const barOf = (line: string) => (line.match(/█/g) ?? []).length;
    expect(barOf(lines[0]!)).toBe(10);
    expect(barOf(lines[1]!)).toBe(0);
    expect(barOf(lines[2]!)).toBe(3); // round(1/4 * 10)
  });

  test("ascii mode swaps block characters", () => {
    const lines = renderHeatmap(buckets, { barWidth: 10, ascii: true });
    expect(lines[0]).toContain("##########");
    expect(lines.join("\n")).not.toContain("█");
  });

  test("renderHeatmapRow keeps min width for a nonzero bucket", () => {
    const row = renderHeatmapRow(buckets[2]!, 100, { barWidth: 10 });
    expect(row).toContain("█"); // round(1/100 * 10) → 0, clamped to 1
  });

  test("labelFor includes the date when buckets cross midnight", () => {
    const midnight = computeHeatmap(
      [at("2026-08-20T23:59:50Z"), at("2026-08-21T00:05:00Z")],
      60_000,
    );
    expect(midnight.length).toBeGreaterThan(1);
    expect(labelFor(midnight[0]!)).toMatch(/^08-20 23:5/);
    expect(labelFor(midnight[0]!)).toContain("→ 00:00");
  });
});
