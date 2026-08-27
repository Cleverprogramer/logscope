import type { LogEntry } from "../types.js";

export interface SequencePair {
  before: LogEntry;
  after: LogEntry;
  delayMs: number;
}

export interface SequenceCorrelation {
  beforeCount: number;
  correlatedCount: number;
  rate: number;
  pairs: SequencePair[];
}

/**
 * Measure how often an entry matching `before` is followed by an entry
 * matching `after` within `windowMs`. Entries without timestamps are ignored
 * because a time-bounded relationship cannot be established safely.
 */
export function correlateSequence(
  entries: LogEntry[],
  before: RegExp,
  after: RegExp,
  windowMs: number,
): SequenceCorrelation {
  if (windowMs <= 0) return { beforeCount: 0, correlatedCount: 0, rate: 0, pairs: [] };

  const timestamped = entries.filter((entry) => entry.timestamp);
  const pairs: SequencePair[] = [];
  let beforeCount = 0;

  for (let i = 0; i < timestamped.length; i++) {
    const source = timestamped[i]!;
    const sourceText = `${source.level} ${source.message}`;
    if (!before.test(sourceText)) continue;
    beforeCount++;

    const sourceTime = source.timestamp!.getTime();
    for (let j = i + 1; j < timestamped.length; j++) {
      const candidate = timestamped[j]!;
      const delayMs = candidate.timestamp!.getTime() - sourceTime;
      if (delayMs < 0) continue;
      if (delayMs > windowMs) break;
      if (after.test(`${candidate.level} ${candidate.message}`)) {
        pairs.push({ before: source, after: candidate, delayMs });
        break;
      }
    }
  }

  return {
    beforeCount,
    correlatedCount: pairs.length,
    rate: beforeCount === 0 ? 0 : pairs.length / beforeCount,
    pairs,
  };
}
