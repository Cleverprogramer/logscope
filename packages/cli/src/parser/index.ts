import type { LogEntry, ParseOptions, ParseResult } from "../types.js";
import { detectFormat } from "./detect.js";
import { parseJsonLine } from "./json.js";
import { parsePlainLine, unknownEntry } from "./plain.js";
import { parseInfraLine } from "./infra.js";
import { compileFormat } from "./custom.js";

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
  custom?: ReturnType<typeof compileFormat>,
): LogEntry {
  if (custom) {
    const parsed = custom(raw);
    if (parsed) return { ...parsed, line };
  }
  const primaryParsed = primary === "json" ? parseJsonLine(raw) : parsePlainLine(raw);
  if (primaryParsed) return { ...primaryParsed, line };

  const fallbackParsed = primary === "json" ? parsePlainLine(raw) : parseJsonLine(raw);
  if (fallbackParsed) return { ...fallbackParsed, line };

  const infraParsed = parseInfraLine(raw);
  if (infraParsed) return { ...infraParsed, line };

  return unknownEntry(raw, line);
}

/**
 * A line that failed both parsers may still belong to the previous entry —
 * stack-trace frames, "Caused by:" chains, ellipsis continuations.
 * Conservative on purpose: real garbage must stay flagged unparsed.
 */
const CONTINUATION_RE = /^\s+\S|^(?:Caused by:|\.\.\. \d+ |Suppressed:)/;

export function isContinuation(raw: string): boolean {
  return raw.trim().length > 0 && CONTINUATION_RE.test(raw);
}

/**
 * Parse an entire log file's content. The dominant format (plain vs JSON
 * lines) is auto-detected from the first lines, but every line individually
 * falls back to the other parser before being flagged as unparsed — so
 * nothing ever crashes or gets silently dropped. Unparseable continuation
 * lines (stack frames) attach to their parent entry instead of standing
 * alone.
 */
export function parseLog(content: string, options: ParseOptions = {}): ParseResult {
  const lines = splitLines(content);
  const format = detectFormat(lines);
  const startLine = options.startLine ?? 0;

  const custom = options.formatTemplate ? compileFormat(options.formatTemplate) : undefined;
  const entries: LogEntry[] = [];
  let unparsedLines = 0;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!;
    const parsed = parseLineWithFallback(raw, startLine + i, format, custom);

    if (
      parsed.unparsed &&
      entries.length > 0 &&
      isContinuation(raw) &&
      !entries[entries.length - 1]!.unparsed
    ) {
      // Stack frame: fold into the parent entry's message.
      const parent = entries[entries.length - 1]!;
      parent.message += `\n${raw}`;
      continue;
    }

    if (parsed.unparsed) unparsedLines += 1;
    entries.push(parsed);
  }

  return { entries, totalLines: lines.length, unparsedLines };
}

