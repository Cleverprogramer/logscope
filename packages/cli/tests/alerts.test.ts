import { describe, expect, test } from "bun:test";
import { recentErrorCount } from "../src/dashboard/alerts.js";
import type { LogEntry } from "../src/types.js";

const error = (at: number): LogEntry => ({ line: at, raw: "", timestamp: new Date(at), level: "ERROR", message: "x", unparsed: false });

describe("recentErrorCount", () => {
  test("counts only errors in the rolling window", () => {
    expect(recentErrorCount([error(90_000), error(30_000)], 100_000)).toBe(1);
  });
});
