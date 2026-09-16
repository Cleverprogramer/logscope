import { percentile } from "./latency.js";
import type { LogEntry, LogLevel } from "../types.js";

/**
 * Correlation-ID extraction and request tracing.
 *
 * Real-world log lines rarely announce their format, so extraction runs a
 * priority ladder: explicit request/trace/correlation ids beat UUIDs, which
 * beat long hex hashes, which beat bracket tokens. One ID per line — the
 * first hit in the ladder wins.
 */

export interface TraceGroup {
  /** The correlation ID shared by every entry in the group. */
  id: string;
  /** Member entries ordered by timestamp, then file order. */
  entries: LogEntry[];
  /** Earliest member timestamp, or null when none had one. */
  first: Date | null;
  /** Latest member timestamp, or null when none had one. */
  last: Date | null;
  /** first → last span in milliseconds, or null without two stamps. */
  durationMs: number | null;
  /** Level breakdown for the group. */
  counts: Record<LogLevel, number>;
}

export interface BuildTraceOptions {
  /** Custom extractor; first capture group when present, else whole match. */
  pattern?: RegExp;
  /** Drop traces with fewer events. Defaults to 2. */
  minEvents?: number;
}

/** req-id:… / request_id=… / trace-id … / correlationId="…" */
const NAMED_ID_RE =
  /\b(?:req(?:uest)?|trace|corr(?:elation)?)[-_ ]?id[:=]\s*"?([\w.:-]+)"?/i;

const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i;

/** 16+ hex chars — request ids, hashes, span ids. */
const HEX_RE = /\b[a-f0-9]{16,}\b/i;

/**
 * Bracket tokens like [7f3a2b81]. Must start with a letter and run 8+ chars
 * so timestamps ("[2026-08-20…") and levels ("[ERROR]") never match.
 */
const BRACKET_RE = /\[([a-zA-Z][\w-]{7,})\]/;

/**
 * Extract the correlation ID carried by one log line, or null when the line
 * carries none. `pattern` bypasses the ladder entirely.
 */
export function extractTraceId(message: string, pattern?: RegExp): string | null {
  if (pattern) {
    const m = pattern.exec(message);
    return m ? (m[1] ?? m[0]) : null;
  }
  return (
    NAMED_ID_RE.exec(message)?.[1] ??
    UUID_RE.exec(message)?.[0] ??
    HEX_RE.exec(message)?.[0] ??
    BRACKET_RE.exec(message)?.[1] ??
    null
  );
}

/**
 * Group entries into per-ID traces. The ID is searched in the parsed
 * message first, then the raw line (JSON metadata often lives outside the
 * message). Traces with fewer than `minEvents` members are dropped; the
 * rest sort longest-span-first, then by event count.
 */
export function buildTraces(entries: LogEntry[], options: BuildTraceOptions = {}): TraceGroup[] {
  const minEvents = Math.max(1, options.minEvents ?? 2);
  const buckets = new Map<string, LogEntry[]>();

  for (const entry of entries) {
    const id = extractTraceId(entry.message, options.pattern) ?? extractTraceId(entry.raw, options.pattern);
    if (!id) continue;
    const bucket = buckets.get(id);
    if (bucket) bucket.push(entry);
    else buckets.set(id, [entry]);
  }

  const traces: TraceGroup[] = [];
  for (const [id, members] of buckets) {
    if (members.length < minEvents) continue;

    const ordered = members
      .map((entry, index) => ({ entry, index }))
      .sort(
        (a, b) =>
          (a.entry.timestamp?.getTime() ?? Infinity) -
            (b.entry.timestamp?.getTime() ?? Infinity) ||
          a.index - b.index,
      )
      .map((x) => x.entry);

    let first: Date | null = null;
    let last: Date | null = null;
    for (const entry of ordered) {
      if (!entry.timestamp) continue;
      if (!first) first = entry.timestamp;
      last = entry.timestamp;
    }
    const counts: Record<LogLevel, number> = {
      ERROR: 0,
      WARN: 0,
      INFO: 0,
      DEBUG: 0,
      UNKNOWN: 0,
    };
    for (const entry of ordered) counts[entry.level] += 1;

    traces.push({
      id,
      entries: ordered,
      first,
      last,
      durationMs: first && last ? last.getTime() - first.getTime() : null,
      counts,
    });
  }

  return traces.sort(
    (a, b) =>
      (b.durationMs ?? -1) - (a.durationMs ?? -1) || b.entries.length - a.entries.length,
  );
}

export interface TraceAggregate {
  /** Number of traces in the group set. */
  count: number;
  /** Span percentile across traces (null spans excluded). */
  p50: number | null;
  p95: number | null;
  max: number | null;
}

/**
 * Span distribution across traces — the summary behind `--aggregate`.
 * Timestamp-less traces still count toward `count` but contribute no span.
 */
export function aggregateTraces(groups: TraceGroup[]): TraceAggregate {
  const spans = groups
    .map((group) => group.durationMs)
    .filter((span): span is number => span !== null)
    .sort((a, b) => a - b);
  return {
    count: groups.length,
    p50: percentile(spans, 50),
    p95: percentile(spans, 95),
    max: spans.length > 0 ? spans[spans.length - 1]! : null,
  };
}

