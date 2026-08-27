import { describe, expect, test } from "bun:test";
import { bannerLines } from "../src/dashboard/banner.js";
import { setAsciiMode } from "../src/symbols.js";

describe("dashboard banner", () => {
  test("is static, narrow, and includes readable product text", () => {
    setAsciiMode(true);
    const lines = bannerLines();
    expect(lines).toHaveLength(2);
    expect(Math.max(...lines.map((line) => line.length))).toBeLessThan(60);
    expect(lines[1]).toContain("logscope");
    setAsciiMode(false);
  });
});
