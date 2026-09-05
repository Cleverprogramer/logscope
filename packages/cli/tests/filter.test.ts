import { describe, expect, test } from "bun:test";
import { applyFilter, makeFilter, parseSince, parseTimeBound } from "../src/filter.js";
import { parsePlain } from "../src/parser/plain.js";
import type { LogEntry } from "../src/types.js";

function fixture(): LogEntry[] {
  return parsePlain([
    "2024-01-15 10:30:45 ERROR Payment failed for order 123",
    "2024-01-15 10:30:46 WARN Slow query on /api/users",
    "2024-01-15 10:30:47 INFO Server healthy",
    "2024-01-15 10:30:48 ERROR Database connection timeout",
    "2024-01-15 10:30:49 DEBUG Cache warmed",
  ]);
}

describe("makeFilter", () => {
  test("no options → everything passes", () => {
    const filter = makeFilter({});
    expect(fixture().filter(filter)).toHaveLength(5);
  });

  test("--level filters case-insensitively", () => {
    const errors = applyFilter(fixture(), { level: "error" });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.level === "ERROR")).toBe(true);
  });

  test("--level accepts comma-separated lists", () => {
    const result = applyFilter(fixture(), { level: "ERROR, warn" });
    expect(result).toHaveLength(3);
  });

  test("unknown level throws a helpful error", () => {
    expect(() => makeFilter({ level: "bogus" })).toThrow(/Unknown level/);
  });

  test("--grep matches message text (case-insensitive)", () => {
    const result = applyFilter(fixture(), { grep: "payment" });
    expect(result).toHaveLength(1);
    expect(result[0]!.message).toContain("Payment");
  });

  test("--grep accepts regex", () => {
    const result = applyFilter(fixture(), { grep: "timeout|Slow" });
    expect(result).toHaveLength(2);
  });

  test("invalid regex throws a helpful error", () => {
    expect(() => makeFilter({ grep: "([" })).toThrow(/Invalid --grep/);
  });

  test("filters combine with AND semantics", () => {
    const result = applyFilter(fixture(), { level: "error,warn", grep: "database" });
    expect(result).toHaveLength(1);
    expect(result[0]!.level).toBe("ERROR");
  });

  describe("--since", () => {
    test("parses relative durations against a fixed now", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      expect(parseSince("30s", now).toISOString()).toBe("2026-08-20T11:59:30.000Z");
      expect(parseSince("5m", now).toISOString()).toBe("2026-08-20T11:55:00.000Z");
      expect(parseSince("2h", now).toISOString()).toBe("2026-08-20T10:00:00.000Z");
      expect(parseSince("7d", now).toISOString()).toBe("2026-08-13T12:00:00.000Z");
    });

    test("parses absolute ISO dates (naive treated as UTC)", () => {
      expect(parseSince("2024-01-01").toISOString()).toBe("2024-01-01T00:00:00.000Z");
      expect(parseSince("2024-01-01T10:30:00Z").toISOString()).toBe(
        "2024-01-01T10:30:00.000Z",
      );
    });

    test("rejects garbage with a helpful error", () => {
      expect(() => parseSince("yesterday-ish")).toThrow(/Invalid --since/);
    });

    test("keeps only entries at or after the cutoff; drops timestamp-less entries", () => {
      const result = applyFilter(fixture(), { since: "2024-01-15T10:30:47Z" });
      // 10:30:47 INFO + 10:30:48 ERROR + 10:30:49 DEBUG
      expect(result).toHaveLength(3);
      expect(result.every((e) => e.timestamp! >= new Date("2024-01-15T10:30:47Z"))).toBe(true);

      const noTs = applyFilter(
        [{ line: 0, raw: "", timestamp: null, level: "UNKNOWN", message: "?", unparsed: true }],
        { since: "1h" },
      );
      expect(noTs).toHaveLength(0);
    });

    test("combines with other filters", () => {
      const result = applyFilter(fixture(), { since: "2024-01-15T10:30:47Z", level: "error" });
      expect(result).toHaveLength(1);
      expect(result[0]!.message).toContain("timeout");
    });
  });

  describe("--after / --before", () => {
    test("keeps entries inside an inclusive absolute window", () => {
      const result = applyFilter(fixture(), {
        after: "2024-01-15T10:30:46Z",
        before: "2024-01-15T10:30:47Z",
      });
      // WARN at 10:30:46 and INFO at 10:30:47 (bounds are inclusive).
      expect(result).toHaveLength(2);
      expect(result.map((e) => e.level)).toEqual(["WARN", "INFO"]);
    });

    test("--after alone works like an absolute lower bound", () => {
      const result = applyFilter(fixture(), { after: "2024-01-15T10:30:48Z" });
      expect(result).toHaveLength(2);
      expect(result.every((e) => e.level === "ERROR" || e.level === "DEBUG")).toBe(true);
    });

    test("--before alone caps the window", () => {
      const result = applyFilter(fixture(), { before: "2024-01-15T10:30:45Z" });
      expect(result).toHaveLength(1);
      expect(result[0]!.level).toBe("ERROR");
    });

    test("parses relative durations against a fixed now", () => {
      const now = new Date("2026-08-20T12:00:00Z");
      expect(parseTimeBound("90s", "--after", now).toISOString()).toBe("2026-08-20T11:58:30.000Z");
      expect(parseTimeBound("2h", "--before", now).toISOString()).toBe("2026-08-20T10:00:00.000Z");
    });

    test("rejects garbage with a flag-aware error", () => {
      expect(() => makeFilter({ after: "last tuesday" })({ ...fixture()[0]! })).toThrow(
        /Invalid --after/,
      );
      expect(() => makeFilter({ before: "tomorrow-ish" })({ ...fixture()[0]! })).toThrow(
        /Invalid --before/,
      );
    });

    test("drops timestamp-less entries from the window", () => {
      const noTs = [{ line: 0, raw: "", timestamp: null, level: "INFO" as const, message: "?", unparsed: false }];
      expect(applyFilter(noTs, { after: "1h" })).toHaveLength(0);
      expect(applyFilter(noTs, { before: "1h" })).toHaveLength(0);
    });

    test("window combines with level and grep filters", () => {
      const result = applyFilter(fixture(), {
        after: "2024-01-15T10:30:46Z",
        before: "2024-01-15T10:30:49Z",
        level: "error",
      });
      expect(result).toHaveLength(1);
      expect(result[0]!.message).toContain("timeout");
    });
  });
});
