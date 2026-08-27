import { afterEach, describe, expect, test } from "bun:test";
import { computeStats, renderReport, type StatsReport } from "../src/commands/stats.js";

const originalLog = console.log;
const ANSI_RE = /\x1b\[[0-9;]*m/g;

function captureLogs(fn: () => void): string {
  const lines: string[] = [];
  console.log = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    fn();
  } finally {
    console.log = originalLog;
  }
  return lines.join("\n").replace(ANSI_RE, "");
}

afterEach(() => {
  console.log = originalLog;
  delete process.env.NO_COLOR;
});

describe("stats command helpers", () => {
  test("computeStats respects --top 0", async () => {
    const report = await computeStats(["samples/sample.log"], { top: "0" });
    expect(report.totalLines).toBe(12);
    expect(report.topGroups).toHaveLength(0);
  });

  test("renderReport handles an empty result", () => {
    process.env.NO_COLOR = "1";
    const report: StatsReport = {
      totalLines: 0,
      unparsedLines: 0,
      levels: { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0, UNKNOWN: 0 },
      timeRange: { first: null, last: null },
      topGroups: [],
    };

    const output = captureLogs(() => renderReport("empty.log", report));
    expect(output).toContain("logscope stats");
    expect(output).toContain("0 lines");
    expect(output).toContain("errors (n/a)");
    expect(output).not.toContain("time range:");
  });

  test("renderReport prints time ranges, unparsed counts, and groups", () => {
    process.env.NO_COLOR = "1";
    const report: StatsReport = {
      totalLines: 3,
      unparsedLines: 1,
      levels: { ERROR: 1, WARN: 1, INFO: 0, DEBUG: 0, UNKNOWN: 1 },
      timeRange: {
        first: "2026-08-20T09:00:00.000Z",
        last: "2026-08-20T09:01:00.000Z",
      },
      topGroups: [
        {
          level: "ERROR",
          count: 2,
          sample: "database timeout",
          firstSeen: "2026-08-20T09:00:00.000Z",
          lastSeen: "2026-08-20T09:01:00.000Z",
        },
      ],
    };

    const output = captureLogs(() => renderReport("app.log", report));
    expect(output).toContain("1 unparsed");
    expect(output).toContain("time range: 2026-08-20 09:00:00");
    expect(output).toContain("top 1 message group");
    expect(output).toContain("database timeout");
  });
});
