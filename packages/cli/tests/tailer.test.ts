import { describe, expect, test } from "bun:test";
import { appendFile, mkdtemp, rm, truncate, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { followLines, LineAssembler } from "../src/tailer.js";

describe("LineAssembler", () => {
  const encoder = new TextEncoder();

  test("splits complete lines and buffers partial ones", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(encoder.encode("hello\nwor"))).toEqual(["hello"]);
    expect(assembler.hasPending).toBe(true);
    expect(assembler.push(encoder.encode("ld\nagain\n"))).toEqual(["world", "again"]);
    expect(assembler.hasPending).toBe(false);
  });

  test("handles \\r\\n line endings", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(encoder.encode("a\r\nb\r\n"))).toEqual(["a", "b"]);
  });

  test("chunk ending exactly on newline emits no partial state", () => {
    const assembler = new LineAssembler();
    expect(assembler.push(encoder.encode("one\ntwo\n"))).toEqual(["one", "two"]);
    expect(assembler.hasPending).toBe(false);
  });

  test("flush returns leftover partial line once", () => {
    const assembler = new LineAssembler();
    assembler.push(encoder.encode("partial"));
    expect(assembler.flush()).toBe("partial");
    expect(assembler.flush()).toBeNull();
  });

  test("multibyte characters split across chunks decode correctly", () => {
    const assembler = new LineAssembler();
    const full = encoder.encode("héllo wörld ✓\n");
    const cut = 3; // splits inside the é (2 bytes: 0xC3 0xA9)
    expect(assembler.push(full.slice(0, cut))).toEqual([]);
    expect(assembler.push(full.slice(cut))).toEqual(["héllo wörld ✓"]);
  });
});

async function nextWithTimeout<T>(promise: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("timed out waiting for followLines")), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

describe("followLines", () => {
  test("yields appended lines and truncation markers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-follow-"));
    const file = join(dir, "app.log");
    const signal = new AbortController();
    const iterator = followLines(file, { pollMs: 5, startLine: 10, signal: signal.signal });

    try {
      await writeFile(file, "seed\n");

      const first = iterator.next();
      await new Promise((resolve) => setTimeout(resolve, 20));
      await appendFile(file, "one\n");
      await expect(nextWithTimeout(first)).resolves.toEqual({
        done: false,
        value: { line: 10, text: "one" },
      });

      const truncated = iterator.next();
      await truncate(file, 0);
      await expect(nextWithTimeout(truncated)).resolves.toEqual({
        done: false,
        value: { line: -1, text: "__TRUNCATED__" },
      });
    } finally {
      signal.abort();
      await iterator.return(undefined);
      await rm(dir, { recursive: true });
    }
  });
});
