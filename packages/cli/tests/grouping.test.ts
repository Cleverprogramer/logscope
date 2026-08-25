import { describe, expect, test } from "bun:test";
import { groupEntries, messageSignature } from "../src/grouping/index.js";
import type { LogEntry } from "../src/types.js";

function entry(partial: Partial<LogEntry> & { line: number }): LogEntry {
  return {
    raw: partial.message ?? "",
    timestamp: null,
    level: "ERROR",
    message: "",
    unparsed: false,
    ...partial,
  };
}

describe("messageSignature", () => {
  test("numbers collapse to <num>", () => {
    expect(messageSignature("Payment failed for order 8841")).toBe(
      "payment failed for order <num>",
    );
    expect(messageSignature("Payment failed for order 12345")).toBe(
      "payment failed for order <num>",
    );
  });

  test("UUIDs, IPs, hashes and quoted strings get placeholders", () => {
    expect(messageSignature("User f47ac10b-58cc-4372-a567-0e02b2c3d479 not found")).toBe(
      "user <id> not found",
    );
    expect(messageSignature("Connection refused from 192.168.1.24")).toBe(
      "connection refused from <ip>",
    );
    expect(messageSignature('Config key "api_key" missing')).toBe("config key <str> missing");
  });

  test("whitespace is collapsed and case normalized", () => {
    expect(messageSignature("Boom!   multiple    SPACES")).toBe("boom! multiple spaces");
  });

  test("empty content → empty signature", () => {
    expect(messageSignature("   ")).toBe("");
  });
});

describe("groupEntries", () => {
  const ts = (iso: string) => new Date(iso);

  test("clusters repeated errors with variable ids into one group", () => {
    const groups = groupEntries([
      entry({ line: 0, level: "ERROR", message: "Payment failed for order 8841" }),
      entry({ line: 1, level: "ERROR", message: "Payment failed for order 8842" }),
      entry({ line: 2, level: "ERROR", message: "Payment failed for order 8843" }),
      entry({ line: 3, level: "INFO", message: "Health check OK" }),
      entry({ line: 4, level: "ERROR", message: "Database timeout after 5000ms" }),
    ]);

    expect(groups).toHaveLength(3);
    const top = groups[0]!;
    expect(top.count).toBe(3);
    expect(top.level).toBe("ERROR");
    expect(top.signature).toBe("payment failed for order <num>");
    expect(top.lines).toEqual([0, 1, 2]);
  });

  test("same text at different levels stays in separate groups", () => {
    const groups = groupEntries([
      entry({ line: 0, level: "WARN", message: "slow query" }),
      entry({ line: 1, level: "ERROR", message: "slow query" }),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups.map((g) => g.level).sort()).toEqual(["ERROR", "WARN"]);
  });

  test("tracks first/last seen across timestamps", () => {
    const groups = groupEntries([
      entry({ line: 0, message: "db down", timestamp: ts("2026-08-20T09:12:30Z") }),
      entry({ line: 1, message: "db down", timestamp: ts("2026-08-20T09:13:31Z") }),
      entry({ line: 2, message: "db down", timestamp: ts("2026-08-20T09:14:32Z") }),
    ]);

    const g = groups[0]!;
    expect(g.firstSeen?.toISOString()).toBe("2026-08-20T09:12:30.000Z");
    expect(g.lastSeen?.toISOString()).toBe("2026-08-20T09:14:32.000Z");
    // Sample should be the most recent message.
    expect(g.sample).toBe("db down");
  });

  test("sorted by frequency descending", () => {
    const groups = groupEntries([
      entry({ line: 0, message: "rare one" }),
      entry({ line: 1, message: "common a" }),
      entry({ line: 2, message: "common a" }),
      entry({ line: 3, message: "common a" }),
      entry({ line: 4, message: "common b" }),
      entry({ line: 5, message: "common b" }),
    ]);
    expect(groups.map((g) => g.count)).toEqual([3, 2, 1]);
  });

  test("empty input → no groups; blank messages skipped", () => {
    expect(groupEntries([])).toHaveLength(0);
    expect(groupEntries([entry({ line: 0, message: "  " })])).toHaveLength(0);
  });
});
