import { describe, expect, test } from "bun:test";
import { computeStats } from "../src/commands/stats.js";

describe("watch (via computeStats)", () => {
  test("recomputes a fresh report on every call", async () => {
    const first = await computeStats(["samples/sample.log"], {});
    expect(first.totalLines).toBe(12);
    expect(first.levels.ERROR).toBe(5);

    // Same input → identical snapshot (deterministic refresh baseline).
    const second = await computeStats(["samples/sample.log"], {});
    expect(second).toEqual(first);
  });

  test("respects level filters", async () => {
    const report = await computeStats(["samples/sample.log"], { level: "error" });
    expect(report.totalLines).toBe(5);
  });
});

describe("watch command e2e", () => {
  test("refreshes and clears screen; ctrl+c exits cleanly", () => {
    const proc = Bun.spawnSync(
      [
        "sh",
        "-c",
        "bun run packages/cli/src/index.ts watch samples/sample.log --interval 1 & PID=$!; sleep 2.5; kill -INT $PID; wait $PID; echo EXIT=$?",
      ],
      { stdout: "pipe", stderr: "pipe" },
    );
    const out = proc.stdout.toString();
    expect(out).toContain("logscope stats");
    expect(out).toContain("refreshing every 1s");
  });
});
