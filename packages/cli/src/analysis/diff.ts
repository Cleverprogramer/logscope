import type { LogGroup } from "../grouping/index.js";

export interface CountChange {
  signature: string;
  level: LogGroup["level"];
  sample: string;
  before: number;
  after: number;
  delta: number;
}

export interface GroupDiff {
  /** Groups present only in the "after" set — new problems. */
  added: LogGroup[];
  /** Groups present only in the "before" set — fixed or gone quiet. */
  resolved: LogGroup[];
  /** Groups in both with a count difference. */
  changed: CountChange[];
}

const key = (g: LogGroup) => `${g.level}::${g.signature}`;

/**
 * Compare two grouped snapshots (e.g. pre-deploy vs post-deploy logs).
 */
export function diffGroups(beforeGroups: LogGroup[], afterGroups: LogGroup[]): GroupDiff {
  const before = new Map(beforeGroups.map((g) => [key(g), g]));
  const after = new Map(afterGroups.map((g) => [key(g), g]));

  const added: LogGroup[] = [];
  const resolved: LogGroup[] = [];
  const changed: CountChange[] = [];

  for (const [k, group] of after) {
    const prev = before.get(k);
    if (!prev) {
      added.push(group);
    } else if (prev.count !== group.count) {
      changed.push({
        signature: group.signature,
        level: group.level,
        sample: group.sample,
        before: prev.count,
        after: group.count,
        delta: group.count - prev.count,
      });
    }
  }
  for (const [k, group] of before) {
    if (!after.has(k)) resolved.push(group);
  }

  // Most dramatic first.
  added.sort((a, b) => b.count - a.count);
  resolved.sort((a, b) => b.count - a.count);
  changed.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  return { added, resolved, changed };
}
