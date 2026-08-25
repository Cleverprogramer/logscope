import { describe, expect, test } from "bun:test";
import { applyFilter, makeFilter, parseSince } from "../src/filter.js";
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
});
