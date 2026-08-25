import { describe, expect, test } from "bun:test";
import { findGaps, formatDuration } from "../src/analysis/gaps.js";
import { parseDurationMs } from "../src/filter.js";
import type { LogEntry } from "../src/types.js";

const at = (iso: string): LogEntry => ({
  line: 0,
  raw: iso,
  timestamp: new Date(iso),
  level: "INFO",
  message: "",
  unparsed: false,
});

describe("findGaps", () => {
  const entries = [
    at("2026-08-20T09:00:00Z"),
    at("2026-08-20T09:01:00Z"),
    // 10-minute silence
    at("2026-08-20T09:11:00Z"),
    at("2026-08-20T09:11:30Z"),
    // 2-minute silence
    at("2026-08-20T09:13:30Z"),
  ];

  test("reports only silences above threshold", () => {
    const gaps = findGaps(entries, 5 * 60_000);
    expect(gaps).toHaveLength(1);
    expect(gaps[0]!.durationMs).toBe(600_000);
  });

  test("threshold inclusive of smaller gaps when lowered", () => {
    expect(findGaps(entries, 60_000)).toHaveLength(3);
  });

  test("longest gap sorts first", () => {
    const gaps = findGaps(entries, 60_000);
    expect(gaps[0]!.durationMs).toBeGreaterThanOrEqual(gaps[1]!.durationMs);
  });

  test("entries without timestamps are ignored", () => {
    const mixed = [...entries.map((e) => e), { ...at("2026-08-20T09:14:00Z"), timestamp: null }];
    expect(findGaps(mixed, 60_000)).toHaveLength(3);
  });
});

describe("formatDuration", () => {
  test("renders human durations", () => {
    expect(formatDuration(45_000)).toBe("45s");
    expect(formatDuration(90_000)).toBe("1m 30s");
    expect(formatDuration(3_723_000)).toBe("1h 2m 3s");
  });
});

describe("parseDurationMs", () => {
  test("unit conversions", () => {
    expect(parseDurationMs("90s")).toBe(90_000);
    expect(parseDurationMs("5m")).toBe(300_000);
    expect(parseDurationMs("2h")).toBe(7_200_000);
    expect(parseDurationMs("nonsense")).toBeNull();
  });
});
