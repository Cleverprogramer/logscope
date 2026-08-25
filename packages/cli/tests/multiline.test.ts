import { describe, expect, test } from "bun:test";
import { parseLog, isContinuation } from "../src/parser/index.js";

const STACK_TRACE = [
  "2026-08-20T09:05:44.120Z ERROR Payment processing failed",
  "\tat com.acme.payments.Gateway.charge(Gateway.java:88)",
  "\tat com.acme.payments.Service.pay(Service.java:41)",
  "Caused by: java.net.SocketTimeoutException: Read timed out",
  "\tat java.base/java.net.SocketInputStream.read(SocketInputStream.java:171)",
  "... 12 common frames omitted",
].join("\n");

describe("multiline stack traces", () => {
  test("isContinuation recognizes frames and cause chains", () => {
    expect(isContinuation("\tat Gateway.java:88")).toBe(true);
    expect(isContinuation("Caused by: SocketTimeoutException")).toBe(true);
    expect(isContinuation("... 12 common frames omitted")).toBe(true);
    expect(isContinuation("2026-08-20 INFO real entry")).toBe(false);
    expect(isContinuation("this line is complete garbage")).toBe(false);
    expect(isContinuation("   ")).toBe(false);
  });

  test("trace folds into a single ERROR entry", () => {
    const result = parseLog(STACK_TRACE);
    // 6 physical lines → 1 entry
    expect(result.totalLines).toBe(6);
    expect(result.entries).toHaveLength(1);
    const entry = result.entries[0]!;
    expect(entry.level).toBe("ERROR");
    expect(entry.message).toContain("Gateway.charge");
    expect(entry.message).toContain("Caused by:");
    expect(entry.unparsed).toBe(false);
  });

  test("garbage after a valid entry stays standalone (not a frame)", () => {
    const content = [
      "2026-08-20 09:00:01 INFO server started",
      "this line is complete garbage and matches no format",
    ].join("\n");
    const result = parseLog(content);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]!.unparsed).toBe(true);
  });

  test("entry following a trace starts fresh", () => {
    const content = STACK_TRACE + "\n" + "2026-08-20T09:06:00Z INFO recovered";
    const result = parseLog(content);
    expect(result.totalLines).toBe(7);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[1]!.level).toBe("INFO");
  });
});
