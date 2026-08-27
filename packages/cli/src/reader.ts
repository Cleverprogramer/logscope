import { readFile, readdir } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parseLog } from "./parser/index.js";
import type { ParseOptions, ParseResult } from "./types.js";

const BINARY_SAMPLE_BYTES = 8 * 1024;
const MAX_CONTROL_BYTE_RATIO = 0.3;

export function isLikelyBinaryContent(raw: Buffer): boolean {
  if (raw.length === 0) return false;

  const sample = raw.subarray(0, Math.min(raw.length, BINARY_SAMPLE_BYTES));
  let controlBytes = 0;

  for (const byte of sample) {
    if (byte === 0) return true;
    const isAllowedWhitespace = byte === 9 || byte === 10 || byte === 12 || byte === 13;
    const isEscape = byte === 27;
    if (byte < 32 && !isAllowedWhitespace && !isEscape) controlBytes += 1;
  }

  return controlBytes / sample.length > MAX_CONTROL_BYTE_RATIO;
}

function decodeText(path: string, raw: Buffer): string {
  if (isLikelyBinaryContent(raw)) {
    throw new Error(`binary file not supported: ${path}`);
  }
  return raw.toString("utf8");
}

/**
 * Decode a raw file buffer based on its extension. Supports plain text,
 * gzip (.gz) and zstd (.zst / .zstd). Returns UTF-8 text ready to parse.
 */
export function decodeContent(path: string, raw: Buffer): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".gz") || lower.endsWith(".gzip")) {
    let decoded: Buffer;
    try {
      decoded = gunzipSync(raw);
    } catch {
      throw new Error(`corrupt gzip file: ${path}`);
    }
    return decodeText(path, decoded);
  }
  if (lower.endsWith(".zst") || lower.endsWith(".zstd")) {
    if (typeof Bun !== "undefined" && typeof Bun.zstdDecompressSync === "function") {
      let decoded: Buffer;
      try {
        decoded = Bun.zstdDecompressSync(raw);
      } catch {
        throw new Error(`corrupt zstd file: ${path}`);
      }
      return decodeText(path, decoded);
    }
    throw new Error(`zstd support requires a newer Bun runtime: ${path}`);
  }
  return decodeText(path, raw);
}

/**
 * Read a log source and parse it end-to-end. `path` "-" reads stdin.
 * Plain text plus gzip/zstd compressed files are supported.
 * Throws a friendly Error for missing/unreadable files — callers decide
 * how to surface it (CLI prints it in red and exits non-zero).
 */
export async function readLogFile(path: string, options: ParseOptions = {}): Promise<ParseResult> {
  if (path === "-") {
    return parseLog(await Bun.stdin.text(), options);
  }

  let content: string;
  try {
    content = decodeContent(path, await readFile(path));
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("zstd support")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("corrupt gzip file:")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("corrupt zstd file:")) {
      throw error;
    }
    if (error instanceof Error && error.message.startsWith("binary file not supported:")) {
      throw error;
    }
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw new Error(`file not found: ${path}`);
    }
    if (code === "EACCES") {
      throw new Error(`permission denied: ${path}`);
    }
    throw new Error(`could not read ${path}: ${error instanceof Error ? error.message : error}`);
  }

  return parseLog(content, options);
}

/** Expand one CLI path argument into concrete file paths (glob-aware). */
export async function expandPaths(pattern: string): Promise<string[]> {
  if (!/[*?[]/.test(pattern)) return [pattern];

  // Split at the last "/" before any glob character so directory parts stay
  // literal; only the basename component is treated as a wildcard pattern.
  const lastSlash = pattern.lastIndexOf("/");
  const dirPart = lastSlash >= 0 ? pattern.slice(0, lastSlash + 1) : "";
  const basePattern = pattern.slice(lastSlash + 1);

  const regex = new RegExp(
    "^" +
      basePattern
        .replace(/[.+^${}()|[\]\\]/g, "\\$&")
        .replace(/\*\*/g, "\u0000")
        .replace(/\*/g, "[^/]*")
        .replace(/\u0000/g, ".*")
        .replace(/\?/g, ".") +
      "$",
  );

  const entries = await readdir(dirPart || ".", { withFileTypes: true });
  const matches = entries
    .filter((e) => e.isFile() && regex.test(e.name))
    .map((e) => `${dirPart}${e.name}`)
    .sort();

  if (matches.length === 0) throw new Error(`no files matched pattern: ${pattern}`);
  return matches;
}

/**
 * Read and parse multiple sources (files, globs, or "-" stdin) into a
 * single merged ParseResult. Entries keep per-file line numbers and gain
 * a `source` field; totals aggregate across every input.
 */
export async function readLogFiles(paths: string[], options: ParseOptions = {}): Promise<ParseResult> {
  const expanded: string[] = [];
  for (const path of paths) {
    expanded.push(...(await expandPaths(path)));
  }

  const entries: ParseResult["entries"] = [];
  let unparsedLines = 0;
  let totalLines = 0;

  for (const path of expanded) {
    const result = await readLogFile(path, options);
    totalLines += result.totalLines;
    unparsedLines += result.unparsedLines;
    // Line numbers restart per file — they reference their source.
    entries.push(...result.entries.map((e) => ({ ...e, source: path })));
  }

  return { entries, totalLines, unparsedLines };
}
