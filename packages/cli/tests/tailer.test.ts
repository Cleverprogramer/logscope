import { describe, expect, test } from "bun:test";
import { LineAssembler } from "../src/tailer.js";

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
