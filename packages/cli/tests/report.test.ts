import { describe, expect, test } from "bun:test";
import { computeStats } from "../src/commands/stats.js";
import { renderHtmlReport, renderMarkdownReport } from "../src/commands/report.js";

describe("report rendering", () => {
  test("HTML report is self-contained and escapes samples", async () => {
    const report = await computeStats(["samples/sample.log"], {});
    const html = renderHtmlReport("sample.log", report);

    expect(html).toContain("<!doctype html>");
    expect(html).toContain("logscope report");
    // Inline styles only — no external asset references.
    expect(html).not.toMatch(/<link|src="http/);
    expect(html).toContain(">Payment failed for order 8843<");
  });

  test("HTML escapes HTML-sensitive sample text", () => {
    const html = renderHtmlReport("t", {
      totalLines: 1,
      unparsedLines: 0,
      levels: { ERROR: 1, WARN: 0, INFO: 0, DEBUG: 0, UNKNOWN: 0 },
      timeRange: { first: null, last: null },
      topGroups: [
        {
          level: "ERROR",
          count: 1,
          sample: '<script>alert("x")</script>',
          firstSeen: null,
          lastSeen: null,
        },
      ],
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
  });

  test("markdown variant renders a table", async () => {
    const report = await computeStats(["samples/sample.log"], { level: "error" });
    const md = renderMarkdownReport("sample.log", report);
    expect(md).toContain("# logscope report");
    expect(md).toContain("| # | level | count |");
    expect(md).toContain("**5** errors");
  });
});
