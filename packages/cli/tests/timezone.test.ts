import { describe, expect, test } from "bun:test";
import { assertTimeZone, formatEntry, formatTimestamp } from "../src/format.js";

describe("--tz timezone display", () => {
  const ts = new Date("2024-01-15T10:30:45Z");

  test("converts to IANA zone (New York, EST)", () => {
    expect(formatTimestamp(ts, "America/New_York")).toContain("2024-01-15 05:30:45");
  });

  test("handles half-hour offsets (Kolkata)", () => {
    expect(formatTimestamp(ts, "Asia/Kolkata")).toContain("2024-01-15 16:00:45");
  });

  test("null timestamp still renders placeholder", () => {
    expect(formatTimestamp(null, "UTC")).not.toContain("20");
  });

  test("assertTimeZone rejects garbage with friendly error", () => {
    expect(() => assertTimeZone("Mars/Olympus")).toThrow(/Unknown timezone/);
    expect(assertTimeZone("UTC")).toBe("UTC");
  });

  test("formatEntry honors tz end-to-end", () => {
    const out = formatEntry(
      { line: 0, timestamp: ts, level: "ERROR", message: "boom", unparsed: false },
      "America/New_York",
    );
    expect(out).toContain("05:30:45");
    expect(out).toContain("boom");
  });
});
