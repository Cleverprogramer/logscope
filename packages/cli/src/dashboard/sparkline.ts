/**
 * ASCII sparkline rendering for time-series counts.
 * Height is 8 levels using Unicode block characters.
 */

const BARS = ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█"];

/**
 * Render `values` as a fixed-width sparkline. Values are scaled to the max;
 * zero values render as a thin baseline. Width beyond values pads with
 * spaces; extra values are downsampled by averaging.
 */
export function sparkline(values: number[], width = 40): string {
  if (values.length === 0) return "";
  if (width <= 0) return "";

  // Downsample into exactly `width` buckets by averaging.
  const buckets: number[] = [];
  const step = values.length / width;
  for (let i = 0; i < width; i++) {
    const start = Math.floor(i * step);
    const end = Math.max(start + 1, Math.floor((i + 1) * step));
    let sum = 0;
    let n = 0;
    for (let j = start; j < Math.min(end, values.length); j++) {
      sum += values[j]!;
      n++;
    }
    buckets.push(n > 0 ? sum / n : 0);
  }

  const max = Math.max(...buckets);
  if (max === 0) return BARS[0]!.repeat(width);

  return buckets
    .map((v) => (v === 0 ? BARS[0] : BARS[Math.min(7, Math.ceil((v / max) * 8) - 1)]))
    .join("");
}
