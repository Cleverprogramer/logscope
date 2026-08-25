import { describe, expect, test } from "bun:test";
import { bucketCounts } from "../src/dashboard/series.js";

describe("bucketCounts", () => {
  test("distributes timestamps across equal buckets", () => {
    const first = 0;
    const last = 1000;
    const counts = bucketCounts([10, 20, 510, 520], first, last, 2);
    expect(counts).toEqual([2, 2]);
  });

  test("clamps out-of-range timestamps into edge buckets", () => {
    const counts = bucketCounts([-50, 500, 2000], 0, 1000, 4);
    expect(counts[0]).toBe(1);
    expect(counts[3]).toBe(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(3);
  });

  test("returns exact width even with no data", () => {
    expect(bucketCounts([], 0, 1000, 8)).toEqual(new Array(8).fill(0));
  });
});
