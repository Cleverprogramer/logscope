import { describe, expect, test } from "bun:test";
import { correlateSequence } from "../src/analysis/sequences.js";
import type { LogEntry } from "../src/types.js";

const entry = (line: number, at: string, level: LogEntry["level"], message: string): LogEntry => ({
  line,
  raw: message,
  timestamp: new Date(at),
  level,
  message,
  metadata: {},
  unparsed: false,
});

describe("correlateSequence", () => {
  test("counts each before event at most once", () => {
    const result = correlateSequence([
      entry(1, "2026-01-01T00:00:00Z", "WARN", "retry"),
      entry(2, "2026-01-01T00:00:01Z", "ERROR", "timeout"),
      entry(3, "2026-01-01T00:01:00Z", "WARN", "retry"),
      entry(4, "2026-01-01T00:01:30Z", "INFO", "ok"),
    ], /WARN retry/, /ERROR timeout/, 10_000);
    expect(result.beforeCount).toBe(2);
    expect(result.correlatedCount).toBe(1);
    expect(result.rate).toBe(0.5);
    expect(result.pairs[0]?.delayMs).toBe(1000);
  });

  test("ignores timestamp-less entries", () => {
    const noTimestamp = { ...entry(1, "2026-01-01T00:00:00Z", "WARN", "retry"), timestamp: null };
    const result = correlateSequence([noTimestamp, entry(2, "2026-01-01T00:00:01Z", "ERROR", "timeout")], /retry/, /timeout/, 10_000);
    expect(result.beforeCount).toBe(0);
    expect(result.correlatedCount).toBe(0);
  });
});
