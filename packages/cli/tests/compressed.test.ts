import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { decodeContent, readLogFile } from "../src/reader.js";

const SAMPLE = [
  "2024-01-15 10:30:45 ERROR boom",
  '{"timestamp":"2024-01-15T10:31:00Z","level":"info","msg":"ok"}',
  "",
].join("\n");

describe("compressed input", () => {
  test("decodeContent passes plain text through", () => {
    expect(decodeContent("app.log", Buffer.from(SAMPLE))).toBe(SAMPLE);
  });

  test(".gz files parse end-to-end", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-gz-"));
    try {
      const file = join(dir, "app.log.gz");
      await writeFile(file, gzipSync(Buffer.from(SAMPLE)));
      const result = await readLogFile(file);
      expect(result.totalLines).toBe(2);
      expect(result.entries[0]!.level).toBe("ERROR");
      expect(result.entries[1]!.level).toBe("INFO");
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test(".zst files round-trip via Bun.zstd", async () => {
    if (typeof Bun.zstdCompressSync !== "function") return; // runtime lacks zstd
    const dir = await mkdtemp(join(tmpdir(), "logscope-zst-"));
    try {
      const file = join(dir, "app.log.zst");
      await writeFile(file, Bun.zstdCompressSync(Buffer.from(SAMPLE)));
      const result = await readLogFile(file);
      expect(result.totalLines).toBe(2);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("corrupt gzip → friendly error", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-badgz-"));
    try {
      const file = join(dir, "bad.log.gz");
      await writeFile(file, Buffer.from("definitely not gzip"));
      const err = await readLogFile(file).catch((e) => e as Error);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toMatch(/corrupt gzip/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
