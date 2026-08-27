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

  test("empty files parse successfully", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-empty-"));
    try {
      const file = join(dir, "empty.log");
      await writeFile(file, "");
      const result = await readLogFile(file);
      expect(result.totalLines).toBe(0);
      expect(result.entries).toHaveLength(0);
      expect(result.unparsedLines).toBe(0);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("likely binary files fail with a friendly error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-binary-"));
    try {
      const file = join(dir, "image.log");
      await writeFile(file, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x00, 0x00, 0x00, 0x0d]));
      const err = (await readLogFile(file).catch((e) => e as Error)) as Error;
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/binary file not supported/);
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
