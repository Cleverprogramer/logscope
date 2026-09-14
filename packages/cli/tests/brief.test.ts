import { describe, expect, test } from "bun:test";
import { computeBrief, renderBrief, renderBriefMarkdown } from "../src/commands/brief.js";
import type { LogEntry } from "../src/types.js";

const at = (iso: string, level: LogEntry["level"], message: string): LogEntry => ({
  line: 0,
  raw: message,
  timestamp: new Date(iso),
  level,
  message,
  unparsed: false,
});

function incidentFixture(): LogEntry[] {
  return [
    at("2026-08-20T09:00:00Z", "INFO", "Server started on port 3000"),
    at("2026-08-20T09:00:10Z", "ERROR", "Payment failed for order 8841"),
    at("2026-08-20T09:00:20Z", "ERROR", "Payment failed for order 8842"),
    at("2026-08-20T09:00:30Z", "ERROR", "Payment failed for order 8843"),
    at("2026-08-20T09:00:40Z", "ERROR", "Payment failed for order 8844"),
    at("2026-08-20T09:00:50Z", "ERROR", "Database connection timeout after 5000ms"),
    // 10m 10s of silence → the longest gap
    at("2026-08-20T09:11:00Z", "INFO", "Recovered, cache warmed in 300ms"),
    at("2026-08-20T09:11:30Z", "ERROR", "Payment failed for order 8845"),
    at("2026-08-20T09:12:30Z", "ERROR", "Payment failed for order 8846"),
  ];
}

describe("computeBrief", () => {
  test("summarizes totals, levels, range, and error rate", () => {
    const brief = computeBrief(incidentFixture());
    expect(brief.totalLines).toBe(9);
    expect(brief.levels.ERROR).toBe(7);
    expect(brief.levels.INFO).toBe(2);
    expect(brief.errorRate).toBeCloseTo(7 / 9);
    expect(brief.timeRange.first).toBe("2026-08-20T09:00:00.000Z");
    expect(brief.timeRange.last).toBe("2026-08-20T09:12:30.000Z");
  });

  test("surfaces normalized top error groups", () => {
    const brief = computeBrief(incidentFixture(), { top: "3" });
    expect(brief.topErrors[0]!.count).toBe(6);
    expect(brief.topErrors[0]!.sample).toContain("order 8846");
    expect(brief.topErrors[1]!.sample).toContain("timeout");
    expect(brief.topErrors).toHaveLength(2);
  });

  test("respects --top 0", () => {
    expect(computeBrief(incidentFixture(), { top: "0" }).topErrors).toHaveLength(0);
  });

  test("extracts latency percentiles from message durations", () => {
    const brief = computeBrief(incidentFixture());
    expect(brief.latency.count).toBe(2); // 5000ms + 300ms
    expect(brief.latency.p50).toBe(300); // nearest-rank over 2 samples
    expect(brief.latency.max).toBe(5000);
  });

  test("finds the longest silence", () => {
    expect(computeBrief(incidentFixture()).longestGapMs).toBe(610_000);
  });

  test("flags the error-rate spike bucket", () => {
    const brief = computeBrief(incidentFixture(), { bucket: "1m" });
    expect(brief.spike).not.toBeNull();
    // Spike buckets anchor at the first error timestamp.
    expect(brief.spike!.from).toBe("2026-08-20T09:00:10.000Z");
    expect(brief.spike!.count).toBe(5);
    // MAD is 0 here, so the z-score is infinite → serialized as null.
    expect(brief.spike!.score).toBeNull();
  });

  test("handles empty input without NaN leaks", () => {
    const brief = computeBrief([]);
    expect(brief.totalLines).toBe(0);
    expect(brief.errorRate).toBeNull();
    expect(brief.longestGapMs).toBeNull();
    expect(brief.spike).toBeNull();
    expect(brief.latency.count).toBe(0);
  });

  test("ignores timestamp-less entries for range and spike scan", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:00Z", "ERROR", "boom in 5ms"), timestamp: null };
    const brief = computeBrief([noTs]);
    expect(brief.timeRange.first).toBeNull();
    expect(brief.spike).toBeNull();
    expect(brief.longestGapMs).toBeNull();
    expect(brief.latency.count).toBe(1);
  });
});

describe("renderBrief", () => {
  test("renders all digest sections", () => {
    const lines = renderBrief("app.log", computeBrief(incidentFixture()));
    const text = lines.join("\n");
    expect(lines[0]).toContain("9 lines");
    expect(lines[0]).toContain("77.8% errors");
    expect(lines[0]).toContain("CRITICAL");
    expect(text).toContain("── top 2 error group(s) ──");
    expect(text).toContain("×6 Payment failed for order 8846");
    expect(text).toContain("latency: p50 300ms");
    expect(text).toContain("longest silence: 10m 10s");
    expect(text).toContain("spike: 5 errors around 09:00:10 (z=∞)");
  });

  test("renders n/a lines for empty input", () => {
    const lines = renderBrief("empty.log", computeBrief([]));
    expect(lines[0]).toContain("0 lines");
    expect(lines.join("\n")).toContain("longest silence: n/a");
    expect(lines.join("\n")).toContain("spike: no error-rate anomalies");
  });
});

describe("computeBrief severity, span, and rate", () => {
  const levels = (errors: number, infos: number): LogEntry[] => {
    const out: LogEntry[] = [];
    for (let i = 0; i < errors; i++) {
      out.push(at("2026-08-20T09:00:00Z", "ERROR", `boom ${i}`));
    }
    for (let i = 0; i < infos; i++) {
      out.push(at("2026-08-20T09:00:00Z", "INFO", `tick ${i}`));
    }
    return out;
  };

  test("classifies severity from the error rate", () => {
    expect(computeBrief(levels(11, 89)).severity).toBe("critical"); // 11%
    expect(computeBrief(levels(3, 97)).severity).toBe("elevated"); // 3%
    expect(computeBrief(levels(2, 98)).severity).toBe("ok"); // exactly 2%
    expect(computeBrief(levels(0, 10)).severity).toBe("ok");
    expect(computeBrief([]).severity).toBe("unknown");
  });

  test("computes span and entries-per-minute", () => {
    const brief = computeBrief(incidentFixture());
    expect(brief.spanMs).toBe(750_000); // 09:00:00 → 09:12:30
    expect(brief.ratePerMin).toBeCloseTo(0.72); // 9 entries over 12.5 min
  });

  test("--after/--before bound the analyzed window", () => {
    const after = computeBrief(incidentFixture(), { after: "2026-08-20T09:11:00Z" });
    expect(after.totalLines).toBe(3);
    expect(after.levels.ERROR).toBe(2);
    expect(after.timeRange.first).toBe("2026-08-20T09:11:00.000Z");
    expect(after.errorRate).toBeCloseTo(2 / 3);

    const before = computeBrief(incidentFixture(), { before: "2026-08-20T09:01:00Z" });
    expect(before.totalLines).toBe(6);
    expect(before.levels.ERROR).toBe(5);
    // Gaps use a 1ms threshold, so the 10s silences inside the window count.
    expect(before.longestGapMs).toBe(10_000);
  });

  test("window drops timestamp-less entries like makeFilter does", () => {
    const noTs: LogEntry = { ...at("2026-08-20T09:00:00Z", "ERROR", "boom"), timestamp: null };
    const brief = computeBrief([at("2026-08-20T09:00:00Z", "INFO", "kept"), noTs], {
      after: "2026-08-20T08:00:00Z",
    });
    expect(brief.totalLines).toBe(1);
    expect(brief.levels.INFO).toBe(1);
  });
});

describe("renderBrief headline and hints", () => {
  test("leads with the severity marker, span, and rate", () => {
    const lines = renderBrief("app.log", computeBrief(incidentFixture()));
    expect(lines[0]).toContain("● CRITICAL");
    expect(lines[0]).toContain("9 lines");
    expect(lines[0]).toContain("09:00:00 → 09:12:30 (12m 30s)");
    expect(lines[0]).toContain("77.8% errors");
    expect(lines[0]).toContain("0.7/min");
  });

  test("renders a placeholder when no error groups exist", () => {
    const lines = renderBrief("app.log", computeBrief([
      at("2026-08-20T09:00:00Z", "INFO", "all good"),
      at("2026-08-20T09:00:01Z", "INFO", "still good"),
    ]));
    expect(lines.join("\n")).toContain("top errors: none");
  });

  test("hints at WARN groups when warnings dominate without a spike", () => {
    const warnings: LogEntry[] = Array.from({ length: 6 }, (_, i) =>
      at(`2026-08-20T09:0${i}:00Z`, "WARN", `slow query ${i}`),
    );
    warnings.push(at("2026-08-20T09:07:00Z", "INFO", "tick"));
    warnings.push(at("2026-08-20T09:08:00Z", "INFO", "tock"));
    const lines = renderBrief("app.log", computeBrief(warnings));
    expect(lines.join("\n")).toContain("note: no error spike but 6 warnings");
  });
});

describe("renderBriefMarkdown", () => {
  test("renders the incident table and sections", () => {
    const md = renderBriefMarkdown("app.log", computeBrief(incidentFixture()));
    expect(md).toContain("# logscope brief — app.log");
    expect(md).toContain("| Severity | **CRITICAL** |");
    expect(md).toContain("| Lines | 9 (77.8% errors) |");
    expect(md).toContain("| Range | 2026-08-20T09:00:00.000Z → 2026-08-20T09:12:30.000Z (12m 30s) |");
    expect(md).toContain("| Rate | 0.7/min |");
    expect(md).toContain("| Longest silence | 10m 10s |");
    expect(md).toContain("| Spike | 5 errors @ 2026-08-20T09:00:10.000Z (z=∞) |");
    expect(md).toContain("## Top Errors");
    expect(md).toContain("1. ×6 `Payment failed for order 8846`");
    expect(md).toContain("## Latency");
    expect(md).toContain("p50 300ms");
  });

  test("renders n/a rows for empty input", () => {
    const md = renderBriefMarkdown("empty.log", computeBrief([]));
    expect(md).toContain("| Severity | **UNKNOWN** |");
    expect(md).toContain("| Range | n/a (n/a) |");
    expect(md).toContain("| Rate | n/a/min |");
    expect(md).toContain("| Spike | none |");
    expect(md).not.toContain("## Top Errors");
    expect(md).not.toContain("## Latency");
  });
});

