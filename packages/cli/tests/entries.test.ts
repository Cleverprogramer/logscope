import { describe, expect, test } from "bun:test";
import { filterEntries } from "../src/dashboard/entries.js";
import type { LogEntry } from "../src/types.js";

const make = (level: LogEntry["level"], message: string): LogEntry => ({
  line: 0, raw: message, timestamp: null, level, message, unparsed: false,
});

describe("filterEntries", () => {
  test("matches level and message case-insensitively", () => {
    const entries = [make("ERROR", "Payment timeout"), make("INFO", "healthy")];
    expect(filterEntries(entries, "timeout")).toHaveLength(1);
    expect(filterEntries(entries, "error")).toHaveLength(1);
  });

  test("empty query preserves order and all entries", () => {
    const entries = [make("INFO", "a"), make("WARN", "b")];
    expect(filterEntries(entries, " ")).toEqual(entries);
  });
});
