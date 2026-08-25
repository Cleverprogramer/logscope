/**
 * Duration extraction and percentile math for latency analysis.
 * Parses human-formatted durations out of log messages — "1240ms",
 * "2.5s", "300µs" — no structured fields required.
 */

const UNIT_MS: Record<string, number> = {
  ms: 1,
  s: 1000,
  "µs": 0.001,
  us: 0.001,
};

/** Extract all durations (in milliseconds) from a free-text message. */
export function extractDurations(text: string): number[] {
  const out: number[] = [];
  const re = /(\d+(?:\.\d+)?)\s*(ms|s|µs|us)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    // Avoid matching the trailing "s" of plain words: require a digit run.
    const unit = m[2]!.toLowerCase();
    out.push(Number(m[1]) * UNIT_MS[unit]!);
  }
  return out;
}

/** Best-effort route extraction: "on /api/users", "for /health", etc. */
export function extractRoute(text: string): string | null {
  const m = /\b(?:on|for|from)\s(\/[A-Za-z0-9\-._~/]*)/.exec(text);
  return m ? m[1]! : null;
}

/** Nearest-rank percentile over a pre-sorted ascending array. */
export function percentile(sortedAsc: number[], p: number): number | null {
  if (sortedAsc.length === 0) return null;
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  );
  return sortedAsc[idx]!;
}

export interface LatencyStats {
  count: number;
  p50: number | null;
  p95: number | null;
  p99: number | null;
  max: number | null;
}

/** Summarize a list of duration samples. */
export function summarize(samplesMs: number[]): LatencyStats {
  if (samplesMs.length === 0) {
    return { count: 0, p50: null, p95: null, p99: null, max: null };
  }
  const sorted = [...samplesMs].sort((a, b) => a - b);
  return {
    count: sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
    max: sorted[sorted.length - 1]!,
  };
}
