import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { excludePaths, expandPaths, normalizeExcludePatterns, readLogFiles } from "../src/reader.js";

async function makeLogDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "logscope-multi-"));
  await writeFile(join(dir, "a.log"), "2024-01-15 10:30:45 ERROR Payment failed for order 1\n2024-01-15 10:30:46 INFO ok\n");
  await writeFile(join(dir, "b.log"), "2024-01-15 10:31:00 ERROR Payment failed for order 2\n");
  await writeFile(join(dir, "c.txt"), "ignore me entirely\n");
  return dir;
}

describe("multi-file + globs", () => {
  test("expandPaths passes plain paths through", async () => {
    expect(await expandPaths("app.log")).toEqual(["app.log"]);
    expect(await expandPaths("-")).toEqual(["-"]);
  });

  test("readLogFiles merges entries with source attribution", async () => {
    const dir = await makeLogDir();
    try {
      const result = await readLogFiles([join(dir, "a.log"), join(dir, "b.log")]);
      expect(result.totalLines).toBe(3);
      expect(result.entries[0]!.source).toBe(join(dir, "a.log"));
      expect(result.entries[2]!.line).toBe(0); // per-file line numbers
      const errors = result.entries.filter((e) => e.level === "ERROR");
      expect(errors).toHaveLength(2);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("glob patterns match only their extension", async () => {
    const dir = await makeLogDir();
    try {
      const result = await readLogFiles([join(dir, "*.log")]);
      // c.txt excluded by the pattern
      expect(result.totalLines).toBe(3);
      expect(new Set(result.entries.map((e) => e.source)).size).toBe(2);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("exclude patterns match basenames and full paths", async () => {
    const dir = await makeLogDir();
    try {
      const result = await readLogFiles([join(dir, "*.log")], { exclude: "*b.log" });
      expect(result.totalLines).toBe(2);
      expect(new Set(result.entries.map((e) => e.source))).toEqual(new Set([join(dir, "a.log")]));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("exclude patterns can be repeated or comma-separated", async () => {
    const dir = await makeLogDir();
    try {
      await writeFile(join(dir, "debug.log"), "2024-01-15 10:31:10 WARN noisy\n");
      const result = await readLogFiles([join(dir, "*.log")], {
        exclude: ["*debug*", "*b.log,c.txt"],
      });
      expect(result.totalLines).toBe(2);
      expect(new Set(result.entries.map((e) => e.source))).toEqual(new Set([join(dir, "a.log")]));
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("all excluded candidates → friendly error", async () => {
    const dir = await makeLogDir();
    try {
      const err = (await readLogFiles([join(dir, "*.log")], { exclude: "*.log" }).catch((e) => e)) as Error;
      expect(err.message).toMatch(/all input files were excluded/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("exclude helpers normalize and filter concrete paths", () => {
    expect(normalizeExcludePatterns([" *debug* , *.tmp ", ""])).toEqual(["*debug*", "*.tmp"]);
    expect(excludePaths(["logs/app.log", "logs/app-debug.log"], "*debug*")).toEqual(["logs/app.log"]);
  });

  test("unmatched glob → friendly error", async () => {
    const dir = await makeLogDir();
    try {
      const err = (await readLogFiles([join(dir, "*.nomatch")]).catch((e) => e)) as Error;
      expect(err.message).toMatch(/no files matched/);
    } finally {
      await rm(dir, { recursive: true });
    }
  });

  test("CLI end-to-end: read <dir/*.log> honors --exclude", async () => {
    const dir = await makeLogDir();
    try {
      await writeFile(join(dir, "debug.log"), "2024-01-15 10:30:46 ERROR skip\n");
      const proc = Bun.spawnSync([
        "bun",
        "run",
        "packages/cli/src/index.ts",
        "read",
        join(dir, "*.log"),
        "--exclude",
        "*debug*",
      ]);
      const out = proc.stdout.toString();
      expect(proc.exitCode).toBe(0);
      expect(out).toContain("Payment failed");
      expect(out).not.toContain("skip");
    } finally {
      await rm(dir, { recursive: true });
    }
  });
});
