import type { LogEntry, LogLevel } from "../types.js";

/**
 * Time-bucketed activity heatmap: counts per severity inside fixed windows
 * between the first and last timestamped entry. Zero-activity buckets are
 * kept so silent periods stay visible.
 */

export interface HeatmapBucket {
  /** Bucket start (inclusive). */
  from: Date;
  /** Bucket end (exclusive). */
  to: Date;
  /** Entries per severity level inside the bucket. */
  counts: Record<LogLevel, number>;
  /** Sum of all level counts for this bucket. */
  total: number;
}

export interface HeatmapRenderOptions {
  /** Bar width in characters. Defaults to 40. */
  barWidth?: number;
  /** Use ASCII-only block characters. */
  ascii?: boolean;
}

const EMPTY_COUNTS = (): Record<LogLevel, number> => ({
  ERROR: 0,
  WARN: 0,
  INFO: 0,
  DEBUG: 0,
  UNKNOWN: 0,
});

/**
 * Bucket timestamped entries into fixed windows covering the full span of
 * the data. Entries without timestamps are ignored; out-of-order input is
 * fine because buckets are computed from min/max, not file order.
 */
export function computeHeatmap(entries: LogEntry[], bucketMs: number): HeatmapBucket[] {
  if (!Number.isFinite(bucketMs) || bucketMs <= 0) {
    throw new Error("heatmap bucket width must be a positive number of milliseconds");
  }

  let min = Infinity;
  let max = -Infinity;
  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const t = entry.timestamp.getTime();
    if (t < min) min = t;
    if (t > max) max = t;
  }
  if (min === Infinity) return [];

  const bucketCount = Math.max(1, Math.floor((max - min) / bucketMs) + 1);
  const buckets: HeatmapBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    from: new Date(min + i * bucketMs),
    to: new Date(min + (i + 1) * bucketMs),
    counts: EMPTY_COUNTS(),
    total: 0,
  }));

  for (const entry of entries) {
    if (!entry.timestamp) continue;
    const idx = Math.min(bucketCount - 1, Math.floor((entry.timestamp.getTime() - min) / bucketMs));
    const bucket = buckets[idx]!;
    bucket.counts[entry.level] += 1;
    bucket.total += 1;
  }

  return buckets;
}

/** One heatmap row, e.g. `09:00 → 09:05  ████████  42 entries (3 error)`. */
export function renderHeatmapRow(bucket: HeatmapBucket, max: number, options: HeatmapRenderOptions = {}): string {
  const barWidth = Math.max(1, options.barWidth ?? 40);
  const block = options.ascii ? "#" : "█";
  const filled = max > 0 ? Math.round((bucket.total / max) * barWidth) : 0;
  const bar = block.repeat(Math.max(bucket.total > 0 ? 1 : 0, filled));
  const extras: string[] = [];
  if (bucket.counts.ERROR > 0) extras.push(`${bucket.counts.ERROR} error`);
  if (bucket.counts.WARN > 0) extras.push(`${bucket.counts.WARN} warn`);
  const detail = extras.length > 0 ? ` (${extras.join(", ")})` : "";
  return `${labelFor(bucket)}  ${bar.padEnd(barWidth)}  ${String(bucket.total).padStart(4)} entries${detail}`;
}

/** Human label for a bucket; includes the date when the span crosses days. */
export function labelFor(bucket: HeatmapBucket): string {
  const from = bucket.from.toISOString();
  const to = bucket.to.toISOString();
  const crossesDays = from.slice(0, 10) !== to.slice(0, 10);
  const start = crossesDays ? from.slice(5, 16).replace("T", " ") : from.slice(11, 16);
  return `${start} → ${to.slice(11, 16)}`;
}

/**
 * Render the full heatmap. Buckets are assumed sorted ascending (the
 * computeHeatmap order). The bar scale is relative to the busiest bucket.
 */
export function renderHeatmap(buckets: HeatmapBucket[], options: HeatmapRenderOptions = {}): string[] {
  const max = buckets.reduce((m, b) => Math.max(m, b.total), 0);
  return buckets.map((bucket) => renderHeatmapRow(bucket, max, options));
}
