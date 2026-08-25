import { readFile } from "node:fs/promises";
import { gunzipSync } from "node:zlib";
import { parseLog } from "./parser/index.js";
import type { ParseResult } from "./types.js";

/**
 * Decode a raw file buffer based on its extension. Supports plain text,
 * gzip (.gz) and zstd (.zst / .zstd). Returns UTF-8 text ready to parse.
 */
export function decodeContent(path: string, raw: Buffer): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".gz") || lower.endsWith(".gzip")) {
    try {
      return gunzipSync(raw).toString("utf8");
    } catch {
      throw new Error(`corrupt gzip file: ${path}`);
    }
  }
  if (lower.endsWith(".zst") || lower.endsWith(".zstd")) {
    if (typeof Bun !== "undefined" && typeof Bun.zstdDecompressSync === "function") {
      return Bun.zstdDecompressSync(raw).toString("utf8");
    }
    throw new Error(`zstd support requires a newer Bun runtime: ${path}`);
  }
  return raw.toString("utf8");
}

/**
 * Read a log source and parse it end-to-end. `path` "-" reads stdin.
 * Plain text plus gzip/zstd compressed files are supported.
 * Throws a friendly Error for missing/unreadable files — callers decide
 * how to surface it (CLI prints it in red and exits non-zero).
 */
export async function readLogFile(path: string): Promise<ParseResult> {
  if (path === "-") {
    return parseLog(await Bun.stdin.text());
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
    const code = (error as NodeJS.ErrnoException)?.code;
    if (code === "ENOENT") {
      throw new Error(`file not found: ${path}`);
    }
    if (code === "EACCES") {
      throw new Error(`permission denied: ${path}`);
    }
    throw new Error(`could not read ${path}: ${error instanceof Error ? error.message : error}`);
  }

  return parseLog(content);
}
