import { describe, expect, test } from "bun:test";
import { detectSpikes } from "../src/analysis/anomalies.js";

const MIN = 60_000;
const BASE = Date.parse("2026-08-20T09:00:00Z");

/** n events evenly spread across `buckets` minutes. */
function flat(buckets: number, perBucket = 1): number[] {
  const out: number[] = [];
  for (let i = 0; i < buckets; i++) {
    for (let j = 0; j < perBucket; j++) out.push(BASE + i * MIN + j);
  }
  return out;
}

describe("detectSpikes", () => {
  test("flat series → no spikes", () => {
    expect(detectSpikes(flat(30), MIN)).toHaveLength(0);
  });

  test("single burst is flagged exactly once", () => {
    const times = flat(30);
    // 12 extra errors inside minute 15.
    for (let j = 0; j < 12; j++) times.push(BASE + 15 * MIN + 100 + j);
    const spikes = detectSpikes(times, MIN);
    expect(spikes).toHaveLength(1);
    expect(spikes[0]!.from.getTime()).toBe(BASE + 15 * MIN);
    expect(spikes[0]!.count).toBeGreaterThanOrEqual(13);
    expect(spikes[0]!.score).toBeGreaterThan(3);
  });

  test("zero-event buckets never flagged but count toward baseline", () => {
    const sparse: number[] = [];
    for (let i = 0; i < 20; i++) {
      if (i === 10) for (let j = 0; j < 20; j++) sparse.push(BASE + i * MIN + j);
      else if (i % 2 === 0) sparse.push(BASE + i * MIN);
    }
    const spikes = detectSpikes(sparse, MIN);
    expect(spikes.map((s) => s.from.getTime())).toContain(BASE + 10 * MIN);
    expect(spikes).toHaveLength(1);
  });

  test("too few events → no analysis", () => {
    expect(detectSpikes([BASE, BASE + 1, BASE + 2], MIN)).toHaveLength(0);
  });
});
