import { describe, expect, test } from "bun:test";
import { selectContextWindows } from "../src/analysis/context.js";
import type { LogEntry } from "../src/types.js";

function entry(level: LogEntry["level"], message: string): LogEntry {
  return { line: 0, raw: message, timestamp: null, level, message, unparsed: false };
}

const isWarnOrError = (e: LogEntry) => e.level === "ERROR" || e.level === "WARN";

describe("selectContextWindows", () => {
  const entries = [
    entry("INFO", "boot"),
    entry("DEBUG", "config"),
    entry("INFO", "request in"),
    entry("WARN", "retry attempt 1"),
    entry("ERROR", "db timeout"),
    entry("INFO", "cleanup"),
    entry("ERROR", "give up"),
    entry("INFO", "exit"),
    entry("INFO", "done"),
  ];

  test("window includes lines before and after the target", () => {
    const windows = selectContextWindows(entries, (e) => e.message === "db timeout", 2, 1);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.start).toBe(2);
    expect(windows[0]!.end).toBe(5);
    expect(windows[0]!.targets).toEqual([4]);
  });

  test("overlapping windows merge and collect all targets", () => {
    // WARN at index 3 and ERRORs at 4/6 with before=3 → everything overlaps.
    const windows = selectContextWindows(entries, isWarnOrError, 3, 1);
    expect(windows).toHaveLength(1);
    expect(windows[0]!.targets.sort()).toEqual([3, 4, 6]);
    expect(windows[0]!.start).toBe(0);
    expect(windows[0]!.end).toBe(7);
  });

  test("clamps at array boundaries", () => {
    const windows = selectContextWindows(entries, (e) => e.level === "INFO" && e.message === "boot", 10, 10);
    expect(windows[0]!.start).toBe(0);
    expect(windows[0]!.end).toBe(8);
  });

  test("no matches → no windows", () => {
    expect(selectContextWindows(entries, () => false, 2, 2)).toHaveLength(0);
  });
});
