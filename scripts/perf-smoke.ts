import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { performance } from "node:perf_hooks";
import { detectSpikes } from "../packages/cli/src/analysis/anomalies.js";
import { extractDurations, summarize } from "../packages/cli/src/analysis/latency.js";
import { correlateSequence } from "../packages/cli/src/analysis/sequences.js";
import { bucketCounts } from "../packages/cli/src/dashboard/series.js";
import { groupEntries } from "../packages/cli/src/grouping/index.js";
import { readLogFile } from "../packages/cli/src/reader.js";

const lineCount = Number(process.env.LOGSCOPE_PERF_LINES ?? 120_000);
const maxTotalMs = Number(process.env.LOGSCOPE_PERF_MAX_MS ?? 15_000);
const fixtureName = "large.log";

function now(): number {
  return performance.now();
}

function elapsed(start: number): number {
  return Number((now() - start).toFixed(1));
}

function generateFixture(lines: number): string {
  const start = Date.UTC(2026, 0, 1, 12, 0, 0);
  const services = ["api", "worker", "billing", "gateway"];
  const routes = ["/api/orders", "/api/users", "/api/payments", "/health"];
  const out = new Array<string>(lines);

  for (let i = 0; i < lines; i += 1) {
    const ts = new Date(start + i * 250).toISOString();
    const service = services[i % services.length]!;
    const route = routes[i % routes.length]!;
    const requestId = `req-${String(i).padStart(6, "0")}`;
    const latencyMs = 20 + (i % 700);

    if (i % 75 === 0) {
      out[i] = `${ts} WARN ${service} retry attempt ${(i % 3) + 1} for ${route} request=${requestId} duration=${latencyMs}ms`;
    } else if (i % 75 === 1) {
      out[i] = `${ts} ERROR ${service} timeout on ${route} request=${requestId} duration=${latencyMs + 1_000}ms`;
    } else if (i % 41 === 0) {
      out[i] = `${ts} ERROR ${service} failed to process order ${10_000 + i} request=${requestId} duration=${latencyMs}ms`;
    } else if (i % 13 === 0) {
      out[i] = `${ts} WARN ${service} queue depth high count=${100 + (i % 50)} duration=${latencyMs}ms`;
    } else {
      out[i] = `${ts} INFO ${service} handled ${route} request=${requestId} duration=${latencyMs}ms`;
    }
  }

  return out.join("\n") + "\n";
}

function assertSmoke(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const temp = mkdtempSync(join(tmpdir(), "logscope-perf-"));
const fixturePath = join(temp, fixtureName);

try {
  await Bun.write(fixturePath, generateFixture(lineCount));

  const totalStart = now();

  const readStart = now();
  const parsed = await readLogFile(fixturePath);
  const readMs = elapsed(readStart);

  const groupStart = now();
  const groups = groupEntries(parsed.entries);
  const groupMs = elapsed(groupStart);

  const analysisStart = now();
  const durations = parsed.entries.flatMap((entry) => extractDurations(entry.message));
  const latency = summarize(durations);
  const timestamps = parsed.entries.flatMap((entry) =>
    entry.timestamp ? [entry.timestamp.getTime()] : [],
  );
  const errorTimestamps = parsed.entries.flatMap((entry) =>
    entry.level === "ERROR" && entry.timestamp ? [entry.timestamp.getTime()] : [],
  );
  const spikes = detectSpikes(errorTimestamps, 60_000, 2.5);
  const sequence = correlateSequence(parsed.entries, /WARN .*retry/i, /ERROR .*timeout/i, 5_000);
  const analysisMs = elapsed(analysisStart);

  const dashboardStart = now();
  const buckets = bucketCounts(timestamps, timestamps[0]!, timestamps[timestamps.length - 1]!, 80);
  const dashboardMs = elapsed(dashboardStart);

  const totalMs = elapsed(totalStart);
  const bucketTotal = buckets.reduce((sum, count) => sum + count, 0);
  const memoryMb = process.memoryUsage().rss / 1024 / 1024;

  assertSmoke(lineCount >= 100_000, `expected at least 100k fixture lines, got ${lineCount}`);
  assertSmoke(parsed.totalLines === lineCount, `expected ${lineCount} total lines, got ${parsed.totalLines}`);
  assertSmoke(parsed.entries.length === lineCount, `expected ${lineCount} parsed entries, got ${parsed.entries.length}`);
  assertSmoke(parsed.unparsedLines === 0, `expected no unparsed lines, got ${parsed.unparsedLines}`);
  assertSmoke(groups.length > 0, "expected at least one log group");
  assertSmoke(latency.count === lineCount, `expected ${lineCount} latency samples, got ${latency.count}`);
  assertSmoke(sequence.beforeCount > 0, "expected retry events for sequence correlation");
  assertSmoke(sequence.correlatedCount > 0, "expected correlated timeout events");
  assertSmoke(bucketTotal === timestamps.length, `expected dashboard buckets to include all events, got ${bucketTotal}`);
  assertSmoke(totalMs <= maxTotalMs, `performance smoke took ${totalMs}ms, above ${maxTotalMs}ms`);

  console.log(`logscope performance smoke (${lineCount.toLocaleString()} lines)`);
  console.log(`read+parse: ${readMs}ms`);
  console.log(`grouping: ${groupMs}ms (${groups.length.toLocaleString()} groups)`);
  console.log(
    `analysis: ${analysisMs}ms (${latency.count.toLocaleString()} latency samples, ${spikes.length} spikes, ${(sequence.rate * 100).toFixed(1)}% retry->timeout)`,
  );
  console.log(`dashboard buckets: ${dashboardMs}ms (${buckets.length} buckets)`);
  console.log(`total: ${totalMs}ms / limit ${maxTotalMs}ms`);
  console.log(`rss: ${memoryMb.toFixed(1)} MiB`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
