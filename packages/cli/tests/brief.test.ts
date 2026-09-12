import { describe, expect, test } from "bun:test";
import { computeBrief, renderBrief } from "../src/commands/brief.js";
import type { LogEntry } from "../src/types.js";

const at = (iso: string, level: LogEntry["level"], message: string): LogEntry => ({
  line: 0,
  raw: message,
  timestamp: new Date(iso),
  level,
  message,
  unparsed: false,
});

function incidentFixture(): LogEntry[] {
  return [
    at("2026-08-20T09:00:00Z", "INFO", "Server started on port 3000"),
    at("2026-08-20T09:00:10Z", "ERROR", "Payment failed for order 8841"),
    at("2026-08-20T09:00:20Z", "ERROR", "Payment failed for order 8842"),
    at("2026-08-20T09:00:30Z", "ERROR", "Payment failed for order 8843"),
    at("2026-08-20T09:00:40Z", "ERROR", "Payment failed for order 8844"),
    at("2026-08-20T09:00:50Z", "ERROR", "Database connection timeout after 5000ms"),
    // 10m 10s of silence → the longest gap
    at("2026-08-20T09:11:00Z", "INFO", "Recovered, cache warmed in 300ms"),
    at("2026-08-20T09:11:30Z", "ERROR", "Payment failed for order 8845"),
    at("2026-08-20T09:12:30Z", "ERROR", "Payment failed for order 8846"),
  ];
}

describe("computeBrief", () => {
  test("summarizes totals, levels, range, and error rate", () => {
    const brief = computeBrief(incidentFixture());
    expect(brief.totalLines).toBe(9);
    expect(brief.levels.ERROR).toBe(7);
    expect(brief.levels.INFO).toBe(2);
    expect(brief.errorRate).toBeCloseTo(7 / 9);
    expect(brief.timeRange.first).toBe("2026-08-20T09:00:00.000Z");
    expect(brief.timeRange.last).toBe("2026-08-20T09:12:30.000Z");
  });

  test("surfaces normalized top error groups", () => {
    const brief = computeBrief(incidentFixture(), { top: "3" });
    expect(brief.topErrors[0]!.count).toBe(6);
    expect(brief.topErrors[0]!.sample).toContain("order 8846");
    expect(brief.topErrors[1]!.sample).toContain("timeout");
    expect(brief.topErrors).toHaveLength(2);
  });

  test("respects --top 0", () => {
    expect(computeBrief(incidentFixture(), { top: "0" }).topErrors).toHaveLength(0);
  });

  test("extracts latency percentiles from message durations", () => {
    const brief = computeBrief(incidentFixture());
    expect(brief.latency.count).toBe(2); // 5000ms + 300ms
    expect(brief.latency.p50).toBe(300); // nearest-rank over 2 samples
    expect(brief.latency.max).toBe(5000);
  });

  test("finds the longest silence", () => {
    expect(computeBrief(incidentFixture()).longestGapMs).toBe(610_000);
  });

  test("flags the error-rate spike bucket", () => {
    const brief = computeBrief(incidentFixture(), { bucket: "1m" });
    expect(brief.spike).not.toBeNull();
    // Spike buckets anchor at the first error timestamp.
    expect(brief.spike!.from).toBe("2026-08-20T09:00:10.000Z");
    expect(brief.spike!.count).toBe(5);
    // MAD is 0 here, so the z-score is infinite → serialized as null.
    expect(brief.spike!.score).toBeNull();
  });

  test("handles empty input without NaN leaks", () => {
    const brief = computeBrief([]);
    expect(brief.totalLines).toBe(0);
    expect(brief.errorRate).toBeNull();
    expect(brief.longestGapMs).toBeNull();
    expect(brief.spike).toBeNull();
    expect(brief.latency.count).toBe(0);
  });

  test("ignores timestamp-less entries for range and spike scan", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:00Z", "ERROR", "boom in 5ms"), timestamp: null };
    const brief = computeBrief([noTs]);
    expect(brief.timeRange.first).toBeNull();
    expect(brief.spike).toBeNull();
    expect(brief.longestGapMs).toBeNull();
    expect(brief.latency.count).toBe(1);
  });
});

describe("renderBrief", () => {
  test("renders all digest sections", () => {
    const lines = renderBrief("app.log", computeBrief(incidentFixture()));
    const text = lines.join("\n");
    expect(lines[0]).toContain("9 lines");
    expect(lines[0]).toContain("77.8% errors");
    expect(text).toContain("top error 1. ×6 Payment failed for order 8846");
    expect(text).toContain("latency: p50 300ms");
    expect(text).toContain("longest silence: 10m 10s");
    expect(text).toContain("spike: 5 errors around 09:00:10 (z=∞)");
  });

  test("renders n/a lines for empty input", () => {
    const lines = renderBrief("empty.log", computeBrief([]));
    expect(lines[0]).toContain("0 lines");
    expect(lines.join("\n")).toContain("longest silence: n/a");
    expect(lines.join("\n")).toContain("spike: no error-rate anomalies");
  });
});
