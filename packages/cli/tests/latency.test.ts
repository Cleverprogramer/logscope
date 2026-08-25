import { describe, expect, test } from "bun:test";
import { extractDurations, extractRoute, percentile, summarize } from "../src/analysis/latency.js";
import { parsePlain } from "../src/parser/plain.js";

describe("extractDurations", () => {
  test("parses ms, s and µs units", () => {
    expect(extractDurations("Slow query: 1240ms on /api")).toEqual([1240]);
    expect(extractDurations("took 2.5s to boot")).toEqual([2500]);
    expect(extractDurations("gc pause 300µs")).toEqual([0.3]);
    expect(extractDurations("12ms then 3s")).toEqual([12, 3000]);
  });

  test("ignores plain numbers and trailing s-words", () => {
    expect(extractDurations("order 8841 failed for users")).toEqual([]);
  });
});

describe("extractRoute", () => {
  test("finds path-like tokens after prepositions", () => {
    expect(extractRoute("Slow query detected: 5ms on /api/users/orders")).toBe("/api/users/orders");
    expect(extractRoute("timeout for /health check")).toBe("/health");
    expect(extractRoute("no route here")).toBeNull();
  });
});

describe("percentile + summarize", () => {
  test("nearest-rank percentiles", () => {
    const sorted = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    expect(percentile(sorted, 50)).toBe(50);
    expect(percentile(sorted, 95)).toBe(100);
    expect(percentile([], 99)).toBeNull();
  });

  test("summarize computes count/p50/p95/p99/max", () => {
    const stats = summarize([100, 200, 300, 400, 500]);
    expect(stats.count).toBe(5);
    expect(stats.p50).toBe(300);
    expect(stats.max).toBe(500);
  });
});

describe("latency over parsed entries", () => {
  test("sample log slow-query line yields its duration", () => {
    const entries = parsePlain(["2026-08-20 09:03:17 WARN Slow query detected: 1240ms on /api/users"]);
    const durations = entries.flatMap((e) => (e.unparsed ? [] : extractDurations(e.message)));
    expect(durations).toEqual([1240]);
    expect(summarize(durations).p50).toBe(1240);
  });
});
