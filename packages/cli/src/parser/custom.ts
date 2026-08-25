import type { LogEntry, LogLevel } from "../types.js";
import { parseTimestamp } from "./timestamp.js";

/**
 * Custom line formats: users describe their layout once with tokens and
 * logscope compiles it to a parser.
 *
 *   --format "{timestamp} [{level}] {message}"
 *   --format "[{level}] {message} (at {timestamp})"
 *
 * {message} may appear at most once; anything not a token is a literal.
 */

const TOKEN_RE = /\{(timestamp|ts|level|message|msg)\}/g;

const LEVEL_WORDS: Record<string, LogLevel> = {
  ERROR: "ERROR",
  FATAL: "ERROR",
  CRITICAL: "ERROR",
  WARN: "WARN",
  WARNING: "WARN",
  INFO: "INFO",
  DEBUG: "DEBUG",
  TRACE: "DEBUG",
};

export interface CustomParser {
  (raw: string): Omit<LogEntry, "line"> | null;
  /** The normalized template, for introspection/tests. */
  template: string;
}

/** Compile a user template into a line parser. Throws on invalid templates. */
export function compileFormat(template: string): CustomParser {
  if (!template.trim()) throw new Error("empty --format template");

  const messageCount = (template.match(/\{(?:message|msg)\}/g) ?? []).length;
  if (messageCount === 0) {
    throw new Error('--format template must contain a {message} or {msg} token');
  }

  const parts: Array<{ kind: "literal" | "timestamp" | "level" | "message"; text?: string }> = [];
  let lastIndex = 0;
  for (const match of template.matchAll(TOKEN_RE)) {
    const idx = match.index!;
    if (idx > lastIndex) {
      parts.push({ kind: "literal", text: template.slice(lastIndex, idx) });
    }
    const token = match[1]!;
    parts.push({ kind: token === "timestamp" || token === "ts" ? "timestamp" : token === "level" ? "level" : "message" });
    lastIndex = idx + match[0].length;
  }
  if (lastIndex < template.length) {
    parts.push({ kind: "literal", text: template.slice(lastIndex) });
  }

  // Build the regex: literals escaped; {message} is greedy when terminal,
  // lazy otherwise so trailing literals bind correctly.
  let pattern = "^";
  const groupOrder: Array<"timestamp" | "level" | "message"> = [];
  parts.forEach((part, i) => {
    if (part.kind === "literal") {
      pattern += part.text!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return;
    }
    groupOrder.push(part.kind);
    const isLastPart = i === parts.length - 1;
    if (part.kind === "message") {
      pattern += isLastPart ? "(.+)" : "(.+?)";
    } else {
      pattern += "(.+?)";
    }
  });
  pattern += "$";

  let regex: RegExp;
  try {
    regex = new RegExp(pattern);
  } catch (error) {
    throw new Error(`invalid --format template: ${(error as Error).message}`);
  }

  const parse = (raw: string): Omit<LogEntry, "line"> | null => {
    const match = regex.exec(raw);
    if (!match) return null;

    let timestamp: Date | null = null;
    let level: LogLevel | null = null;
    let message: string | null = null;

    groupOrder.forEach((kind, i) => {
      const value = match[i + 1] ?? "";
      if (kind === "timestamp") timestamp = parseTimestamp(value);
      else if (kind === "level") {
        const word = value.trim().toUpperCase();
        level = LEVEL_WORDS[word] ?? null;
        if (!level && !word) level = null;
      } else {
        message = value.trim();
      }
    });

    if (message === null || message === "") return null;
    // Explicit templates are trusted: a structural match is enough even
    // when the level word is unknown or no timestamp token exists.

    return {
      raw,
      timestamp,
      level: level ?? "UNKNOWN",
      message,
      unparsed: false,
    };
  };

  return Object.assign(parse, { template });
}
