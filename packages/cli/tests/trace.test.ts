import { describe, expect, test } from "bun:test";
import { buildTraces, aggregateTraces, extractTraceId } from "../src/analysis/trace.js";
import { renderTraceAggregate, renderTraces } from "../src/commands/trace.js";
import type { LogEntry } from "../src/types.js";

const at = (iso: string, level: LogEntry["level"], message: string): LogEntry => ({
  line: 0,
  raw: message,
  timestamp: new Date(iso),
  level,
  message,
  unparsed: false,
});

describe("extractTraceId", () => {
  test("ladder: named ids win over uuids, hex, and brackets", () => {
    expect(extractTraceId("request_id=req_a done")).toBe("req_a");
    expect(extractTraceId("traceId=abc.123 upstream")).toBe("abc.123");
    expect(extractTraceId("trace-id: 7f3a ok")).toBe("7f3a");
    expect(extractTraceId('correlationId="c-9" ok')).toBe("c-9");
  });

  test("uuid, hex, and bracket fallbacks", () => {
    expect(extractTraceId("plumbing 550e8400-e29b-41d4-a716-446655440000 done")).toBe(
      "550e8400-e29b-41d4-a716-446655440000",
    );
    expect(extractTraceId("span 9f2c1a3b4d5e6f7081 rejected")).toBe("9f2c1a3b4d5e6f7081");
    expect(extractTraceId("[b7e2a1c4] cache miss storm")).toBe("b7e2a1c4");
  });

  test("brackets never swallow timestamps or levels", () => {
    expect(extractTraceId("[2026-08-20T09:00:10Z] started")).toBeNull();
    expect(extractTraceId("[ERROR] no id")).toBeNull();
    expect(extractTraceId("[warning] still none")).toBeNull();
  });

  test("returns null without any id", () => {
    expect(extractTraceId("nothing to correlate here")).toBeNull();
  });

  test("custom pattern uses the capture group or whole match", () => {
    const grouped = /session=([\w-]+)/;
    expect(extractTraceId("session=alpha-123 started", grouped)).toBe("alpha-123");
    expect(extractTraceId("op 42 finished", /op \d+/)).toBe("op 42");
    expect(extractTraceId("unrelated", grouped)).toBeNull();
  });
});

describe("buildTraces", () => {
  const fixture = (): LogEntry[] => [
    at("2026-08-20T09:00:10Z", "INFO", "request_id=req_a entering gateway"),
    at("2026-08-20T09:00:11Z", "ERROR", "request_id=req_a Payment failed for order 8841"),
    at("2026-08-20T09:00:12Z", "WARN", "request_id=req_a retrying upstream"),
    at("2026-08-20T09:00:30Z", "ERROR", "[b7e2a1c4] cache miss storm"),
    at("2026-08-20T09:00:31Z", "INFO", "[b7e2a1c4] cache reloaded"),
    at("2026-08-20T09:00:40Z", "INFO", "untracked single line"), // dropped: 1 event
  ];

  test("groups entries by id with counts and span", () => {
    const traces = buildTraces(fixture());
    expect(traces).toHaveLength(2);
    const reqA = traces.find((t) => t.id === "req_a")!;
    expect(reqA.entries).toHaveLength(3);
    expect(reqA.counts).toEqual({ ERROR: 1, WARN: 1, INFO: 1, DEBUG: 0, UNKNOWN: 0 });
    expect(reqA.durationMs).toBe(2000);
    expect(reqA.first!.toISOString()).toBe("2026-08-20T09:00:10.000Z");
    expect(reqA.last!.toISOString()).toBe("2026-08-20T09:00:12.000Z");
  });

  test("sorts longest span first", () => {
    const traces = buildTraces(fixture());
    expect(traces[0]!.id).toBe("req_a");
    expect(traces[1]!.id).toBe("b7e2a1c4");
  });

  test("minEvents drops short traces", () => {
    expect(buildTraces(fixture(), { minEvents: 3 })).toHaveLength(1);
    // The third line carries no ID at all, so it never forms a trace.
    expect(buildTraces(fixture(), { minEvents: 1 })).toHaveLength(2);
  });

  test("orders member entries by timestamp, then file order", () => {
    const traces = buildTraces([
      at("2026-08-20T09:00:20Z", "INFO", "request_id=rz second"),
      at("2026-08-20T09:00:10Z", "INFO", "request_id=rz first"),
      at("2026-08-20T09:00:10Z", "INFO", "request_id=rz first-later-in-file"),
    ]);
    const messages = traces[0]!.entries.map((e) => e.message);
    expect(messages[0]).toBe("request_id=rz first");
    expect(messages[1]).toBe("request_id=rz first-later-in-file");
    expect(messages[2]).toBe("request_id=rz second");
  });

  test("handles timestamp-less members", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:10Z", "INFO", "request_id=rq x"), timestamp: null };
    const traces = buildTraces([at("2026-08-20T09:00:10Z", "ERROR", "request_id=rq boom"), noTs]);
    expect(traces[0]!.first!.toISOString()).toBe("2026-08-20T09:00:10.000Z");
    expect(traces[0]!.durationMs).toBe(0);
  });

  test("empty input yields no traces", () => {
    expect(buildTraces([])).toHaveLength(0);
  });

  test("custom pattern drives the grouping", () => {
    const traces = buildTraces(
      [
        at("2026-08-20T09:00:10Z", "INFO", "session=alpha start"),
        at("2026-08-20T09:00:11Z", "INFO", "session=alpha middle"),
        at("2026-08-20T09:00:12Z", "ERROR", "session=beta boom"),
      ],
      { pattern: /session=([\w-]+)/, minEvents: 2 },
    );
    expect(traces).toHaveLength(1);
    expect(traces[0]!.id).toBe("alpha");
  });
});


describe("renderTraces", () => {
  const traces = buildTraces([
    at("2026-08-20T09:00:10Z", "INFO", "request_id=req_a entering gateway"),
    at("2026-08-20T09:00:11Z", "ERROR", "request_id=req_a Payment failed for order 8841"),
    at("2026-08-20T09:00:12Z", "WARN", "request_id=req_a retrying upstream"),
  ]);

  test("renders header, entry lines, and level summary", () => {
    const lines = renderTraces(traces, 10);
    expect(lines[0]).toContain("▶ req_a — 3 events · 2s · 1 error, 1 warn, 1 info");
    expect(lines[1]).toContain("09:00:10 INFO");
    expect(lines[1]).toContain("entering gateway");
    expect(lines[2]).toContain("09:00:11 ERROR");
    expect(lines[3]).toContain("09:00:12 WARN");
  });

  test("caps per-trace events with a +N more marker", () => {
    const lines = renderTraces(traces, 2);
    expect(lines[2]).toContain("09:00:11 ERROR");
    expect(lines[3]).toContain("+1 more event(s)");
    expect(lines.join("\n")).not.toContain("retrying upstream");
  });

  test("renders no-timestamps span placeholder", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:10Z", "INFO", "request_id=rq x"), timestamp: null };
    const lines = renderTraces(buildTraces([noTs, { ...noTs, message: "request_id=rq y" }]), 5);
    expect(lines[0]).toContain("2 events · no timestamps");
    expect(lines[1]).toContain("--:--:--");
  });
});


describe("aggregateTraces", () => {
  const fixture = () =>
    buildTraces([
      at("2026-08-20T09:00:10Z", "INFO", "request_id=ra one"),
      at("2026-08-20T09:00:30Z", "ERROR", "request_id=ra two"),
      at("2026-08-20T09:01:00Z", "INFO", "request_id=rb one"),
      at("2026-08-20T09:01:02Z", "INFO", "request_id=rb two"),
      at("2026-08-20T09:02:00Z", "WARN", "request_id=rc lone"),
      at("2026-08-20T09:03:00Z", "INFO", "untracked"),
    ], { minEvents: 2 });

  test("summarizes the span distribution", () => {
    const agg = aggregateTraces(fixture());
    // ra spans 20s, rb spans 2s.
    expect(agg.count).toBe(2);
    expect(agg.p50).toBe(2000);
    expect(agg.p95).toBe(20_000);
    expect(agg.max).toBe(20_000);
  });

  test("excludes timestamp-less spans but keeps the count", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:10Z", "INFO", "request_id=rn x"), timestamp: null };
    const agg = aggregateTraces([
      ...fixture(),
      ...buildTraces([noTs, { ...noTs, message: "request_id=rn y" }]),
    ]);
    expect(agg.count).toBe(3);
    expect(agg.p50).toBe(2000);
    expect(agg.max).toBe(20_000);
  });

  test("returns null percentiles without any spans", () => {
    const agg = aggregateTraces([]);
    expect(agg.count).toBe(0);
    expect(agg.p50).toBeNull();
    expect(agg.p95).toBeNull();
    expect(agg.max).toBeNull();
  });
});

describe("renderTraceAggregate", () => {
  const groups = buildTraces([
    at("2026-08-20T09:00:10Z", "INFO", "request_id=ra one"),
    at("2026-08-20T09:00:30Z", "ERROR", "request_id=ra two"),
    at("2026-08-20T09:01:00Z", "INFO", "request_id=rb one"),
    at("2026-08-20T09:01:02Z", "INFO", "request_id=rb two"),
  ]);

  test("renders summary plus slowest-first ranking", () => {
    const lines = renderTraceAggregate(groups, 10);
    expect(lines[0]).toContain("2 traces · span p50 2s · p95 20s · max 20s");
    expect(lines[2]).toContain("1. ra");
    expect(lines[2]).toContain("2 events · 20s · 1 error, 1 info");
    expect(lines[3]).toContain("2. rb");
    expect(lines[3]).toContain("2 events · 2s");
  });

  test("caps rows and hints at the remainder", () => {
    const lines = renderTraceAggregate([...groups, ...groups], 2);
    expect(lines[2]).toContain("1. ra");
    expect(lines[3]).toContain("2. rb");
    expect(lines.join("\n")).toContain("… and 2 more");
  });

  test("shows n/a span for timestamp-less traces", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:10Z", "INFO", "request_id=rn x"), timestamp: null };
    const lines = renderTraceAggregate(buildTraces([noTs, { ...noTs, message: "request_id=rn y" }]), 5);
    expect(lines[0]).toContain("p50 n/a");
    expect(lines[2]).toContain("· n/a · 2 info");
  });
});

