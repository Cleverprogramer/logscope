import { describe, expect, test, afterEach } from "bun:test";
import { colorEnabled, painter } from "../src/color.js";
import { formatEntry } from "../src/format.js";

const entry = {
  line: 0,
  timestamp: new Date("2024-01-15T10:30:45Z"),
  level: "ERROR" as const,
  message: "boom",
  unparsed: false,
};

afterEach(() => {
  delete process.env.NO_COLOR;
  delete process.env.FORCE_COLOR;
});

describe("color gate", () => {
  test("NO_COLOR disables all ANSI output", () => {
    process.env.NO_COLOR = "1";
    expect(colorEnabled()).toBe(false);
    const out = formatEntry(entry);
    expect(out).not.toContain("\x1b[");
    expect(out).toContain("boom");
  });

  test("FORCE_COLOR=0 disables even when forced elsewhere", () => {
    process.env.FORCE_COLOR = "0";
    expect(colorEnabled()).toBe(false);
  });

  test("FORCE_COLOR=1 forces colors on non-TTY", () => {
    process.env.FORCE_COLOR = "1";
    expect(colorEnabled()).toBe(true);
    expect(painter().red("x")).toContain("\x1b[");
  });

  test("plain proxy renders raw text through chained styles", () => {
    process.env.NO_COLOR = "1";
    const p = painter();
    expect((p.bgRed as any).white.bold(" ALERT ")).toBe(" ALERT ");
    expect(p.dim("x")).toBe("x");
  });

  test("compact mode produces a single normalized line", () => {
    process.env.NO_COLOR = "1";
    expect(formatEntry({ ...entry, message: "first\nsecond" }, undefined, { mode: "compact" })).toContain("ERROR first second");
  });

  test("verbose mode includes metadata", () => {
    process.env.NO_COLOR = "1";
    expect(formatEntry({ ...entry, metadata: { requestId: "abc" } }, undefined, { mode: "verbose" })).toContain('metadata: {"requestId":"abc"}');
  });
});
