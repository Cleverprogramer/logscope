import { describe, expect, test } from "bun:test";
import { formatEntryJson } from "../src/format.js";
import type { LogEntry } from "../src/types.js";

describe("NDJSON output", () => {
  test("serializes a full entry, round-trips as JSON", () => {
    const entry: LogEntry = {
      line: 4,
      timestamp: new Date("2026-08-20T09:05:44.120Z"),
      level: "ERROR",
      message: "Payment failed",
      raw: '{"level":"error","msg":"Payment failed","orderId":8841}',
      unparsed: false,
      metadata: { orderId: 8841 },
    };
    const parsed = JSON.parse(formatEntryJson(entry));
    expect(parsed).toEqual({
      line: 4,
      timestamp: "2026-08-20T09:05:44.120Z",
      level: "ERROR",
      message: "Payment failed",
      metadata: { orderId: 8841 },
      unparsed: false,
    });
  });

  test("omits empty metadata; null timestamp stays null", () => {
    const parsed = JSON.parse(
      formatEntryJson({
        line: 0,
        timestamp: null,
        level: "UNKNOWN",
        message: "garbage",
        raw: "garbage",
        unparsed: true,
      }),
    );
    expect(parsed.metadata).toBeUndefined();
    expect(parsed.timestamp).toBeNull();
    expect(parsed.unparsed).toBe(true);
  });

  test("CLI end-to-end: --out jsonl emits parse-only lines", () => {
    const proc = Bun.spawnSync(
      ["sh", "-c", "bun run packages/cli/src/index.ts read samples/sample.log --out jsonl -q"],
      { stdout: "pipe", stderr: "pipe" },
    );
    expect(proc.exitCode).toBe(0);
    const lines = proc.stdout.toString().trim().split("\n");
    expect(lines.length).toBe(12);
    const records = lines.map((l) => JSON.parse(l));
    const levels = new Set(records.map((r) => r.level));
    expect(levels.has("ERROR")).toBe(true);
    expect(records[0]!.message).toContain("Server started");
  });
});
