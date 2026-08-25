import type { LogEntry, LogLevel } from "../types.js";

export interface ParsedInfra {
  raw: string;
  timestamp: Date | null;
  level: LogLevel;
  message: string;
  metadata?: Record<string, unknown>;
  unparsed: false;
}

const MONTHS: Record<string, number> = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
};

/**
 * Syslog (RFC3164-style): "<13>Aug 20 09:00:01 host sshd[412]: Failed password"
 * Year is absent from the format — we assume the current year. Level comes
 * from the PRI severity bits when the priority is well-formed; otherwise INFO.
 */
export function parseSyslogLine(raw: string): ParsedInfra | null {
  const m = /^<(\d{1,3})>([A-Z][a-z]{2}) ([ \d]\d) (\d{2}:\d{2}:\d{2}) (\S+) ([^:\[]+)(?:\[(\d+)\])?: (.*)$/.exec(raw);
  if (!m) return null;
  const [, priStr, mon, day, time, host, tag, pid, message] = m;
  const pri = Number(priStr);
  const severity = pri % 8; // RFC 3164: facility*8 + severity
  const level: LogLevel =
    severity <= 2 ? "ERROR" : severity <= 4 ? "WARN" : severity === 7 ? "DEBUG" : "INFO";
  // Timestamps without a year are ambiguous; anchor to the current one.
  const now = new Date();
  const timestamp = new Date(
    Date.UTC(now.getUTCFullYear(), MONTHS[mon!] ?? 0, Number(day!.trim()), ...time!.split(":").map(Number) as [number, number, number]),
  );
  return {
    raw,
    timestamp: Number.isNaN(timestamp.getTime()) ? null : timestamp,
    level,
    message: message!,
    metadata: {
      ...(host ? { host } : {}),
      ...(tag ? { tag: tag!.trim() } : {}),
      ...(pid ? { pid: Number(pid) } : {}),
      syslogPri: pri,
    },
    unparsed: false,
  };
}

const ACCESS_RE =
  /^(\S+) \S+ \S+ \[([^\]]+)\] "([^"]*)" (\d{3}) (\S+)(?: "([^"]*)" "([^"]*)")?/;

/** HTTP status → log level. */
function statusToLevel(status: number): LogLevel {
  if (status >= 500) return "ERROR";
  if (status >= 400) return "WARN";
  return "INFO";
}

/**
 * Nginx/Apache combined access log:
 * `ip - user [time] "REQUEST" status bytes "referer" "user-agent"`
 */
export function parseAccessLogLine(raw: string): ParsedInfra | null {
  const m = ACCESS_RE.exec(raw);
  if (!m) return null;
  const [, ip, time, request, statusStr, bytes, referer, userAgent] = m;
  const status = Number(statusStr);
  const timestamp = new Date(time!.replace(/:(\d{2})$/, " $1").replace("-", "T"));
  return {
    raw,
    timestamp: Number.isNaN(timestamp.getTime()) ? null : timestamp,
    level: statusToLevel(status),
    message: `${request} ${status}`,
    metadata: {
      ip,
      status,
      ...(bytes !== "-" ? { bytes: Number(bytes) } : {}),
      ...(referer && referer !== "-" ? { referer } : {}),
      ...(userAgent && userAgent !== "-" ? { userAgent } : {}),
    },
    unparsed: false,
  };
}

const CRI_RE = /^(\S{20,}\S)\s+(stdout|stderr)\s+(F|P)\s+(.*)$/;

/**
 * Kubernetes/CRI container runtime prefix:
 * `2026-08-20T09:00:00.123456789Z stdout F message...`
 */
export function parseCriLine(raw: string): ParsedInfra | null {
  const m = CRI_RE.exec(raw);
  if (!m) return null;
  const [, ts, stream, , message] = m;
  const timestamp = new Date(ts!);
  return {
    raw,
    timestamp: Number.isNaN(timestamp.getTime()) ? null : timestamp,
    level: stream === "stderr" ? "WARN" : "INFO",
    message: message!,
    metadata: { stream },
    unparsed: false,
  };
}

/** Try each infra parser in order; first match wins. */
export function parseInfraLine(raw: string): ParsedInfra | null {
  return parseSyslogLine(raw) ?? parseAccessLogLine(raw) ?? parseCriLine(raw);
}
