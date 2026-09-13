import { describe, expect, test } from "bun:test";
import {
  escapeLabelValue,
  renderPrometheus,
} from "../src/commands/metrics.js";
import type { StatsReport } from "../src/commands/stats.js";

function fixture(overrides: Partial<StatsReport> = {}): StatsReport {
  return {
    totalLines: 12,
    unparsedLines: 1,
    levels: { ERROR: 4, WARN: 2, INFO: 3, DEBUG: 2, UNKNOWN: 1 },
    timeRange: {
      first: "2026-08-20T09:00:01.000Z",
      last: "2026-08-20T09:15:00.000Z",
    },
    topGroups: [
      {
        level: "ERROR",
        count: 3,
        sample: 'Payment "failed" for order 8843\n',
        firstSeen: "2026-08-20T09:05:44.000Z",
        lastSeen: "2026-08-20T09:05:46.000Z",
      },
    ],
    ...overrides,
  };
}

describe("renderPrometheus", () => {
  const lines = renderPrometheus(fixture());
  const text = lines.join("\n");

  test("emits counters with HELP/TYPE preamble", () => {
    expect(text).toContain("# HELP logscope_lines_total Total log lines analyzed.");
    expect(text).toContain("# TYPE logscope_lines_total counter");
    expect(text).toContain("logscope_lines_total 12");
    expect(text).toContain("logscope_unparsed_lines_total 1");
  });

  test("exposes one labeled counter per level, lowercased", () => {
    expect(text).toContain('logscope_level_total{level="error"} 4');
    expect(text).toContain('logscope_level_total{level="warn"} 2');
    expect(text).toContain('logscope_level_total{level="info"} 3');
    expect(text).toContain('logscope_level_total{level="debug"} 2');
    expect(text).toContain('logscope_level_total{level="unknown"} 1');
  });

  test("emits span gauges from the covered time range", () => {
    const first = Date.parse("2026-08-20T09:00:01Z") / 1000;
    expect(text).toContain(`logscope_first_timestamp_seconds ${first}`);
    expect(text).toContain("logscope_span_seconds 899");
  });

  test("labels top groups with properly escaped samples", () => {
    expect(text).toContain(
      'logscope_group_total{level="error",sample="Payment \\"failed\\" for order 8843\\n"} 3',
    );
  });

  test("honors a custom prefix", () => {
    const custom = renderPrometheus(fixture(), "myapp").join("\n");
    expect(custom).toContain("myapp_lines_total 12");
    expect(custom).not.toContain("logscope_lines_total");
  });

  test("omits span gauges without a known time range", () => {
    const timeless = renderPrometheus(
      fixture({ timeRange: { first: null, last: null } }),
    );
    expect(timeless.join("\n")).not.toContain("_seconds ");
  });

  test("omits group metrics when there are no groups", () => {
    const empty = renderPrometheus(fixture({ topGroups: [] }));
    expect(empty.join("\n")).not.toContain("group_total");
  });
});

describe("escapeLabelValue", () => {
  test("escapes backslashes, quotes, and newlines", () => {
    expect(escapeLabelValue('a"b\\c\nd')).toBe('a\\"b\\\\c\\nd');
    expect(escapeLabelValue("plain")).toBe("plain");
  });
});
