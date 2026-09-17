import { describe, expect, test } from "bun:test";
import { parseJsonLine } from "../src/parser/json.js";
import { parseLog } from "../src/parser/index.js";
import { parseArrivedLine } from "../src/commands/tail.js";

const time = "2019-01-01T11:11:11.111111111Z";
const envelope = (fields: Record<string, unknown> = {}) =>
  JSON.stringify({ log: "hello\n", stream: "stdout", time, ...fields });

describe("Docker JSON envelopes", () => {
  test.each(["stdout", "stderr"])("preserves %s without inventing severity", (stream) => {
    const raw = envelope({ stream, attrs: { service: "api" } });
    const parsed = parseJsonLine(raw);
    expect(parsed).toEqual({
      raw,
      message: "hello",
      timestamp: new Date("2019-01-01T11:11:11.111Z"),
      level: "UNKNOWN",
      metadata: { stream, attrs: { service: "api" } },
      unparsed: false,
    });
  });

  test.each([
    ["  hello  \r\n", "  hello  "],
    ["first\nsecond\n", "first\nsecond"],
    ["hello\n\n", "hello\n"],
    ["partial", "partial"],
    ["", ""],
  ])("removes only one terminal line ending from %j", (log, message) => {
    expect(parseJsonLine(envelope({ log }))?.message).toBe(message);
  });

  test("retains a message with an invalid timestamp", () => {
    expect(parseJsonLine(envelope({ time: "invalid" }))?.timestamp).toBeNull();
    expect(parseJsonLine(envelope({ time: "invalid" }))?.unparsed).toBe(false);
  });

  test("respects an explicit timestamp offset", () => {
    expect(parseJsonLine(envelope({ time: "2026-01-01T12:00:00+05:30" }))?.timestamp?.toISOString())
      .toBe("2026-01-01T06:30:00.000Z");
  });

  test.each([
    { log: 123 }, { stream: "other" }, { stream: null }, { time: 123 },
    { log: null }, { time: null },
  ])("rejects incomplete or malformed envelopes: %j", (fields) => {
    expect(parseJsonLine(envelope(fields))).toBeNull();
  });

  test("does not reinterpret generic JSON with a log field", () => {
    expect(parseJsonLine('{"log":"not an envelope"}')).toBeNull();
    const parsed = parseJsonLine('{"msg":"application message","log":"context"}');
    expect(parsed?.message).toBe("application message");
    expect(parsed?.metadata).toEqual({ log: "context" });
  });

  test("works in mixed batch input and live-line parsing", () => {
    const raw = envelope();
    const result = parseLog([
      "2026-01-01T00:00:00Z INFO ready",
      raw,
      '{"level":"error","msg":"failed"}',
    ].join("\n"));
    expect(result.totalLines).toBe(3);
    expect(result.unparsedLines).toBe(0);
    expect(result.entries.map((entry) => entry.message)).toEqual(["ready", "hello", "failed"]);
    expect(parseArrivedLine(raw, 7)).toEqual({ ...parseJsonLine(raw)!, line: 7 });
  });
});
