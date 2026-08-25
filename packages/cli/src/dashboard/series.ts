/** Shared time-bucketing for dashboard sparklines. */

/**
 * Distribute event timestamps into `width` equal buckets across
 * [firstTs, lastTs]. Timestamps outside the range clamp into the edge
 * buckets. Returns exactly `width` counts.
 */
export function bucketCounts(
  timestamps: number[],
  firstTs: number,
  lastTs: number,
  width: number,
): number[] {
  const buckets = new Array<number>(width).fill(0);
  if (width <= 0) return buckets;
  const span = Math.max(1, lastTs - firstTs);
  for (const t of timestamps) {
    const idx = Math.min(width - 1, Math.max(0, Math.floor(((t - firstTs) / span) * width)));
    buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}
