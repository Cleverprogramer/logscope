import { describe, expect, test } from "bun:test";
import { diffGroups } from "../src/analysis/diff.js";
import type { LogGroup } from "../src/grouping/index.js";

function group(signature: string, count: number, level: LogGroup["level"] = "ERROR"): LogGroup {
  return {
    signature,
    level,
    sample: signature,
    count,
    firstSeen: null,
    lastSeen: null,
    lines: [],
  };
}

describe("diffGroups", () => {
  test("classifies added / resolved / changed", () => {
    const before = [group("timeout <num>", 5), group("disk full", 2), group("slow query", 3, "WARN")];
    const after = [group("timeout <num>", 9), group("oom kill", 1), group("slow query", 3, "WARN")];

    const diff = diffGroups(before, after);
    expect(diff.added.map((g) => g.signature)).toEqual(["oom kill"]);
    expect(diff.resolved.map((g) => g.signature)).toEqual(["disk full"]);
    expect(diff.changed).toHaveLength(1);
    expect(diff.changed[0]!.delta).toBe(4);
  });

  test("identical profiles → empty diff", () => {
    const groups = [group("x <num>", 1)];
    expect(diffGroups(groups, groups)).toEqual({ added: [], resolved: [], changed: [] });
  });

  test("same text at different levels counts as separate keys", () => {
    const diff = diffGroups([group("boom", 1)], [group("boom", 1, "WARN")]);
    expect(diff.added).toHaveLength(1);
    expect(diff.resolved).toHaveLength(1);
    expect(diff.changed).toHaveLength(0);
  });
});
