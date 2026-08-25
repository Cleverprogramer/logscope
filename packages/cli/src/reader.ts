import { readFile } from "node:fs/promises";
import { parseLog } from "./parser/index.js";
import type { ParseResult } from "./types.js";

/**
 * Read a log source and parse it end-to-end. `path` "-" reads stdin.
 * Throws a friendly Error for missing/unreadable files — callers decide
 * how to surface it (CLI prints it in red and exits non-zero).
 */
export async function readLogFile(path: string): Promise<ParseResult> {
  if (path === "-") {
    return parseLog(await Bun.stdin.text());
  }

  let content: string;
  try {
    content = await readFile(path, "utf8");
  } catch (error) {
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
