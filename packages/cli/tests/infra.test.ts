import { describe, expect, test } from "bun:test";
import { parseSyslogLine, parseAccessLogLine, parseCriLine } from "../src/parser/infra.js";
import { parseLog } from "../src/parser/index.js";

describe("syslog", () => {
  test("parses PRI, host, tag and pid", () => {
    const parsed = parseSyslogLine("<13>Aug 20 09:00:01 web01 sshd[412]: Failed password for root")!;
    expect(parsed).not.toBeNull();
    expect(parsed.level).toBe("INFO");
    expect(parsed.message).toBe("Failed password for root");
    expect(parsed.metadata?.host).toBe("web01");
    expect(parsed.metadata?.tag).toBe("sshd");
    expect(parsed.metadata?.pid).toBe(412);
  });

  test("severity bits drive level (0-2 ERROR, 3-4 WARN)", () => {
    // pri 2 = kern.error → ERROR
    expect(parseSyslogLine("<2>Aug 20 09:00:01 h kernel: oops")!.level).toBe("ERROR");
    // pri 12 = user.warning → WARN
    expect(parseSyslogLine("<12>Aug 20 09:00:01 h cron: job missed")!.level).toBe("WARN");
  });
});

describe("access log (combined)", () => {
  const line =
    '203.0.113.42 - - [20/Aug/2026:09:00:01 +0000] "GET /api/users HTTP/1.1" 200 512 "-" "curl/8.4"';

  test("200 → INFO with request/status message", () => {
    const parsed = parseAccessLogLine(line)!;
    expect(parsed.level).toBe("INFO");
    expect(parsed.message).toContain("GET /api/users");
    expect(parsed.metadata?.status).toBe(200);
    expect(parsed.metadata?.userAgent).toBe("curl/8.4");
  });

  test("500 → ERROR, 404 → WARN", () => {
    expect(
      parseAccessLogLine(line.replace("200 512", "500 1024"))!.level,
    ).toBe("ERROR");
    expect(
      parseAccessLogLine(line.replace("200 512", "404 153"))!.level,
    ).toBe("WARN");
  });
});

describe("kubernetes CRI", () => {
  test("stdout F prefix stripped; stderr maps to WARN", () => {
    const out = parseCriLine("2026-08-20T09:00:00.123456789Z stdout F Server started")!;
    expect(out.level).toBe("INFO");
    expect(out.message).toBe("Server started");
    expect(out.timestamp?.toISOString()).toBe("2026-08-20T09:00:00.123Z");

    const err = parseCriLine("2026-08-20T09:00:00.123456789Z stderr F boom")!;
    expect(err.level).toBe("WARN");
    expect(err.message).toBe("boom");
  });
});

describe("infra formats inside parseLog fallback chain", () => {
  test("mixed infra file parses without unparsed lines", () => {
    const content = [
      "<13>Aug 20 09:00:01 web01 sshd[412]: Failed password for root",
      '203.0.113.42 - - [20/Aug/2026:09:00:02 +0000] "GET /health HTTP/1.1" 200 2',
      "2026-08-20T09:00:03.123456789Z stdout F container says hi",
    ].join("\n");
    const result = parseLog(content);
    expect(result.totalLines).toBe(3);
    expect(result.unparsedLines).toBe(0);
  });
});
