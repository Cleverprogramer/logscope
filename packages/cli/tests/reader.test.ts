import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readLogFile } from "../src/reader.js";

describe("readLogFile", () => {
  test("reads and parses a real file end-to-end", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-"));
    try {
      const file = join(dir, "app.log");
      await writeFile(
        file,
        ["2024-01-15 10:30:45 ERROR boom", '{"level":"info","msg":"ok"}', "garbage"].join("\n"),
      );
      const result = await readLogFile(file);
      expect(result.totalLines).toBe(3);
      expect(result.unparsedLines).toBeGreaterThanOrEqual(1);
      expect(result.entries.some((e) => e.level === "ERROR")).toBe(true);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("missing file → friendly error", async () => {
    try {
      await readLogFile("/nonexistent/nope.log");
      throw new Error("expected readLogFile to throw");
    } catch (error) {
      expect((error as Error).message).toMatch(/file not found/);
    }
  });
});
