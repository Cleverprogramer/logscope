import { describe, expect, test } from "bun:test";
import { detectFormat } from "../src/parser/detect.js";
import { DEFAULT_MAX_LINE_LENGTH, parseLog, splitLines } from "../src/parser/index.js";

describe("detectFormat", () => {
  test("detects JSON lines when majority of lines are objects", () => {
    const lines = ['{"msg":"a"}', '{"msg":"b"}', '{"msg":"c"}'];
    expect(detectFormat(lines)).toBe("json");
  });

  test("detects plain text otherwise", () => {
    expect(detectFormat(["2024-01-01 00:00:00 INFO hello"])).toBe("plain");
    expect(detectFormat([])).toBe("plain");
    expect(detectFormat(["", "   "])).toBe("plain");
  });

  test("mixed file with >=50% JSON candidates → json", () => {
    expect(detectFormat(['{"msg":"a"}', "plain line"])).toBe("json");
  });
});

describe("splitLines", () => {
  test("handles \\r\\n and trailing newline", () => {
    expect(splitLines("a\r\nb\r\n")).toEqual(["a", "b"]);
    expect(splitLines("a\nb\nc")).toEqual(["a", "b", "c"]);
    expect(splitLines("")).toEqual([]);
  });
});

describe("parseLog end-to-end", () => {
  const mixed = [
    "2026-08-20 09:00:01 INFO Server started on port 3000",
    "",
    '{"timestamp":"2026-08-20T09:05:44.120Z","level":"error","msg":"Payment failed","orderId":8841}',
    "this line is complete garbage",
  ].join("\n");

  test("parses a mixed-format file without crashing, flagging garbage as unparsed", () => {
    const result = parseLog(mixed);

    // JSON-dominant detection kicks in; plain line flagged unparsed
    expect(result.totalLines).toBe(4);
    expect(result.unparsedLines).toBeGreaterThanOrEqual(1);
    const errorEntry = result.entries.find((e) => e.level === "ERROR")!;
    expect(errorEntry.metadata).toEqual({ orderId: 8841 });
  });

  test("never throws on arbitrary garbage input", () => {
    expect(() => parseLog("\n\n\n{{{}}}@@@\n\x00\x01binary junk\n")).not.toThrow();
  });

  test("caps extremely long physical lines", () => {
    const longMessage = "x".repeat(DEFAULT_MAX_LINE_LENGTH + 100);
    const result = parseLog(`2024-01-15 10:30:45 ERROR ${longMessage}`);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.raw.length).toBeLessThanOrEqual(DEFAULT_MAX_LINE_LENGTH);
    expect(result.entries[0]!.message).toContain("[truncated]");
  });

  test("supports a custom max line length", () => {
    const result = parseLog("plain garbage line", { maxLineLength: 8 });
    expect(result.entries[0]!.raw).toHaveLength(8);
  });
});
