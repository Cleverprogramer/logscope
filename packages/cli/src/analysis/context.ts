import type { LogEntry } from "../types.js";

/** A merged run of context lines containing one or more target entries. */
export interface ContextWindow {
  /** Inclusive start index into the entries array. */
  start: number;
  /** Inclusive end index. */
  end: number;
  /** Indices of the target (matched) entries within this window. */
  targets: number[];
}

/**
 * For every entry matching `isTarget`, build a [i-before, i+after] window,
 * then merge overlapping/adjacent windows so repeated errors don't print
 * the same context repeatedly. Returns windows in file order.
 */
export function selectContextWindows(
  entries: LogEntry[],
  isTarget: (entry: LogEntry) => boolean,
  before: number,
  after: number,
): ContextWindow[] {
  const ranges: Array<[number, number]> = [];
  for (let i = 0; i < entries.length; i++) {
    if (!isTarget(entries[i]!)) continue;
    ranges.push([Math.max(0, i - before), Math.min(entries.length - 1, i + after)]);
  }

  // Sort by start and merge overlapping or touching ranges.
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: ContextWindow[] = [];
  for (const [start, end] of ranges) {
    const last = merged[merged.length - 1];
    if (last && start <= last.end + 1) {
      last.end = Math.max(last.end, end);
      for (let t = start; t <= end; t++) {
        if (isTarget(entries[t]!) && !last.targets.includes(t)) last.targets.push(t);
      }
    } else {
      const targets: number[] = [];
      for (let t = start; t <= end; t++) {
        if (isTarget(entries[t]!)) targets.push(t);
      }
      merged.push({ start, end, targets });
    }
  }
  return merged;
}
