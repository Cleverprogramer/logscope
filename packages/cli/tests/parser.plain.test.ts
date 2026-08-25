import { describe, expect, test } from "bun:test";
import { parsePlainLine, parsePlain } from "../src/parser/plain.js";

describe("parsePlainLine", () => {
  test("parses bracketed ISO timestamp format", () => {
    const parsed = parsePlainLine("[2024-01-15T10:30:45Z] ERROR Payment failed for order 123")!;
    expect(parsed).not.toBeNull();
    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toBe("Payment failed for order 123");
    expect(parsed.timestamp?.toISOString()).toBe("2024-01-15T10:30:45.000Z");
  });

  test("parses space-separated timestamp format", () => {
    const parsed = parsePlainLine("2024-01-15 10:30:45 WARN Slow query detected")!;
    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("Slow query detected");
  });

  test("handles fractional seconds and offsets", () => {
    const parsed = parsePlainLine("2024-01-15T10:30:45.123+02:00 INFO hi")!;
    expect(parsed.timestamp?.getTime()).toBeGreaterThan(0);
  });

  test("naive timestamps (no zone) are treated as UTC, not host-local", () => {
    const parsed = parsePlainLine("2024-01-15 10:30:45 INFO hi")!;
    expect(parsed.timestamp?.toISOString()).toBe("2024-01-15T10:30:45.000Z");
  });

  test("normalizes WARNING/FATAL/CRITICAL/TRACE", () => {
    expect(parsePlainLine("2024-01-01 00:00:00 WARNING w")!.level).toBe("WARN");
    expect(parsePlainLine("2024-01-01 00:00:00 FATAL f")!.level).toBe("ERROR");
    expect(parsePlainLine("2024-01-01 00:00:00 CRITICAL c")!.level).toBe("ERROR");
    expect(parsePlainLine("2024-01-01 00:00:00 TRACE t")!.level).toBe("DEBUG");
  });

  test("is case-insensitive on level", () => {
    expect(parsePlainLine("2024-01-01 00:00:00 error lowercase works")!.level).toBe("ERROR");
  });

  test("returns null for lines without a level or timestamp", () => {
    expect(parsePlainLine("just some random text")).toBeNull();
    expect(parsePlainLine("")).toBeNull();
    // Timestamp but no level → not a valid plain log line
    expect(parsePlainLine("2024-01-01 00:00:00 no level here")).toBeNull();
  });
});

describe("parsePlain (whole file)", () => {
  test("flags unmatched lines as unparsed UNKNOWN", () => {
    const entries = parsePlain([
      "2024-01-15 10:30:45 ERROR boom",
      "garbage",
      "[2024-01-15T10:31:00Z] INFO ok",
    ]);

    expect(entries).toHaveLength(3);
    expect(entries[0]!.level).toBe("ERROR");
    expect(entries[1]!.unparsed).toBe(true);
    expect(entries[1]!.message).toBe("garbage");
    expect(entries[2]!.level).toBe("INFO");
  });

  test("line numbers follow the startLine offset", () => {
    const entries = parsePlain(["2024-01-15 10:30:45 ERROR x"], { startLine: 99 });
    expect(entries[0]!.line).toBe(99);
  });
});
