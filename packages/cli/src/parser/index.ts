import type { LogEntry, ParseOptions, ParseResult } from "../types.js";
import { detectFormat } from "./detect.js";
import { parseJsonLine } from "./json.js";
import { parsePlainLine, unknownEntry } from "./plain.js";

export { detectFormat, type LogFormat } from "./detect.js";
export { parseJson, parseJsonLine } from "./json.js";
export { parsePlain, parsePlainLine } from "./plain.js";

/** Split file content into lines, tolerating \r\n and a missing trailing newline. */
export function splitLines(content: string): string[] {
  const parts = content.split(/\r?\n/);
  if (parts.length > 0 && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

/**
 * Parse one line with the primary format's parser, falling back to the other
 * format for stray lines (e.g. a JSON entry inside a plain-text log), and
 * finally flagging truly unparseable lines as UNKNOWN/unparsed.
 */
function parseLineWithFallback(
  raw: string,
  line: number,
  primary: "plain" | "json",
): LogEntry {
  const primaryParsed = primary === "json" ? parseJsonLine(raw) : parsePlainLine(raw);
  if (primaryParsed) return { ...primaryParsed, line };

  const fallbackParsed = primary === "json" ? parsePlainLine(raw) : parseJsonLine(raw);
  if (fallbackParsed) return { ...fallbackParsed, line };

  return unknownEntry(raw, line);
}

/**
 * Parse an entire log file's content. The dominant format (plain vs JSON
 * lines) is auto-detected from the first lines, but every line individually
 * falls back to the other parser before being flagged as unparsed — so
 * nothing ever crashes or gets silently dropped.
 */
export function parseLog(content: string, options: ParseOptions = {}): ParseResult {
  const lines = splitLines(content);
  const format = detectFormat(lines);
  const startLine = options.startLine ?? 0;

  const entries = lines.map((raw, i) => parseLineWithFallback(raw, startLine + i, format));

  return {
    entries,
    totalLines: entries.length,
    unparsedLines: entries.filter((e) => e.unparsed).length,
  };
}

