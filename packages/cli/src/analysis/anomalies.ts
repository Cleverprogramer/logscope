/**
 * Offline spike detection over timestamped events (errors, warnings…).
 *
 * Uses a robust z-score — deviation from the *median*, scaled by the MAD
 * (median absolute deviation) — so a giant burst doesn't inflate its own
 * baseline the way mean/σ would. Deterministic, zero dependencies, no AI.
 */

export interface Spike {
  /** Bucket start (inclusive). */
  from: Date;
  /** Bucket end (exclusive). */
  to: Date;
  /** Events inside this bucket. */
  count: number;
  /** Robust z-score vs all buckets. */
  score: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1]! + sorted[mid]!) / 2 : sorted[mid]!;
}

/**
 * Bucket event times into fixed windows and flag windows whose robust
 * z-score reaches `sensitivity`. Buckets with zero events are kept in the
 * baseline (silence shouldn't hide spikes) but never flagged themselves.
 */
export function detectSpikes(
  timestamps: number[],
  bucketMs: number,
  sensitivity = 3,
): Spike[] {
  if (timestamps.length < 4 || bucketMs <= 0) return [];

  const min = Math.min(...timestamps);
  const max = Math.max(...timestamps);
  const bucketCount = Math.max(1, Math.floor((max - min) / bucketMs) + 1);
  const counts = new Array<number>(bucketCount).fill(0);

  for (const t of timestamps) {
    const idx = Math.min(bucketCount - 1, Math.floor((t - min) / bucketMs));
    counts[idx] = (counts[idx] ?? 0) + 1;
  }

  const med = median(counts);
  const deviations = counts.map((c) => Math.abs(c - med));
  const mad = median(deviations);
  // A constant series has MAD 0; treat any nonzero bucket as infinitely
  // anomalous rather than dividing by zero.
  const scale = mad === 0 ? null : 1.4826 * mad;

  const spikes: Spike[] = [];
  for (let i = 0; i < bucketCount; i++) {
    const count = counts[i]!;
    if (count === 0) continue;
    const score = scale === null ? (count > med ? Infinity : 0) : (count - med) / scale;
    if (score >= sensitivity) {
      spikes.push({
        from: new Date(min + i * bucketMs),
        to: new Date(min + (i + 1) * bucketMs),
        count,
        score: Number.isFinite(score) ? Number(score.toFixed(2)) : Infinity,
      });
    }
  }
  return spikes;
}
