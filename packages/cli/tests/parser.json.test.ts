import { describe, expect, test } from "bun:test";
import { parseJsonLine, parseJson } from "../src/parser/json.js";

describe("parseJsonLine", () => {
  test("parses standard NDJSON log line with aliases and metadata", () => {
    const parsed = parseJsonLine(
      '{"timestamp":"2024-06-01T10:00:00.000Z","level":"error","msg":"Payment failed","orderId":123}',
    )!;

    expect(parsed).not.toBeNull();
    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toBe("Payment failed");
    expect(parsed.timestamp?.toISOString()).toBe("2024-06-01T10:00:00.000Z");
    expect(parsed.metadata).toEqual({ orderId: 123 });
    expect(parsed.unparsed).toBe(false);
  });

  test("supports alternate field names (time/severity/text)", () => {
    const parsed = parseJsonLine(
      '{"time": 1717232400, "severity": "warning", "text": "Disk almost full"}',
    )!;
    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("Disk almost full");
    expect(parsed.timestamp?.getTime()).toBe(1717232400 * 1000);
  });

  test("normalizes FATAL/CRITICAL to ERROR and TRACE to DEBUG", () => {
    expect(parseJsonLine('{"level":"fatal","msg":"x"}')!.level).toBe("ERROR");
    expect(parseJsonLine('{"level":"CRITICAL","msg":"x"}')!.level).toBe("ERROR");
    expect(parseJsonLine('{"level":"trace","msg":"x"}')!.level).toBe("DEBUG");
  });

  test("epoch seconds vs milliseconds heuristics", () => {
    // > 1e12 → already milliseconds
    expect(parseJsonLine('{"ts": 1717232400123, "msg":"x"}')!.timestamp?.getTime()).toBe(1717232400123);
    // small number → seconds
    expect(parseJsonLine('{"ts": 1717232400, "msg":"x"}')!.timestamp?.getTime()).toBe(1717232400000);
  });

  test("returns null for non-object JSON or invalid JSON", () => {
    expect(parseJsonLine("[1,2,3]")).toBeNull();
    expect(parseJsonLine("{not json")).toBeNull();
    expect(parseJsonLine('"just a string"')).toBeNull();
  });

  test("returns null for JSON object without recognizable level or message", () => {
    expect(parseJsonLine('{"foo":"bar"}')).toBeNull();
  });

  test("JSON with message but no level → UNKNOWN level, still parsed", () => {
    const parsed = parseJsonLine('{"msg":"something happened"}')!;
    expect(parsed.level).toBe("UNKNOWN");
    expect(parsed.unparsed).toBe(false);
  });
});

describe("parseJson (whole file)", () => {
  test("flags bad lines as unparsed UNKNOWN entries without crashing", () => {
    const lines = [
      '{"level":"info","msg":"ok"}',
      "garbage line",
      '{"level":"error","msg":"boom"}',
    ];
    const entries = parseJson(lines);

    expect(entries).toHaveLength(3);
    expect(entries[0]!.level).toBe("INFO");
    expect(entries[1]!.unparsed).toBe(true);
    expect(entries[1]!.level).toBe("UNKNOWN");
    expect(entries[1]!.raw).toBe("garbage line");
    expect(entries[2]!.level).toBe("ERROR");
  });

  test("respects startLine offset", () => {
    const entries = parseJson(['{"msg":"x"}'], { startLine: 41 });
    expect(entries[0]!.line).toBe(41);
  });
});
