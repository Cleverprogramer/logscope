import { open } from "node:fs/promises";

/**
 * Incremental tailing support: turn arbitrary appended chunks of bytes/text
 * into complete lines without losing partial-line state between chunks.
 * Kept free of filesystem concerns so it can be unit-tested directly.
 */
export class LineAssembler {
  private pending = "";
  private decoder = new TextDecoder("utf-8");

  /**
   * Feed raw bytes (a newly appended file slice). Returns every complete
   * line the bytes completed; trailing partial lines stay buffered until
   * their newline arrives. Handles \n and \r\n boundaries.
   */
  push(bytes: Uint8Array): string[] {
    const text = this.decoder.decode(bytes, { stream: true });
    return this.pushText(text);
  }

  /** Same as push() but for already-decoded text. */
  pushText(text: string): string[] {
    this.pending += text;
    const lines = this.pending.split(/\r?\n/);
    // Last element is either "" (chunk ended on a newline) or a partial line.
    this.pending = lines.pop() ?? "";
    return lines;
  }

  /** True while a partially-received line is still buffered. */
  get hasPending(): boolean {
    return this.pending.length > 0;
  }

  /**
   * Return any buffered partial line (used when the writer is known idle or
   * the file was replaced — real log writers always end lines, but robustness
   * beats assumptions).
   */
  flush(): string | null {
    const out = this.pending;
    this.pending = "";
    return out.length > 0 ? out : null;
  }
}

/** Options for followLines(). */
export interface FollowOptions {
  /** How often to poll the file for appends, in milliseconds. */
  pollMs?: number;
  /** Line number to assign to the first yielded line. */
  startLine?: number;
  /** AbortSignal to stop following (e.g. on UI exit). */
  signal?: AbortSignal;
}

/**
 * Yield newly appended lines of `path` forever (like `tail -f`), as
 * `{ line, text }` pairs with zero-based line numbers continuing from
 * `startLine`. Handles truncation/rotation by restarting at line 0. Stops
 * cleanly when `signal` aborts.
 */
export async function* followLines(
  path: string,
  options: FollowOptions = {},
): AsyncGenerator<{ line: number; text: string }> {
  const pollMs = options.pollMs ?? 250;
  const assembler = new LineAssembler();
  let offset: number;
  let nextLine = options.startLine ?? 0;
  const handle = await open(path, "r");
  try {
    offset = (await handle.stat()).size;

    while (!options.signal?.aborted) {
      await new Promise((resolve) => setTimeout(resolve, pollMs));
      if (options.signal?.aborted) return;

      const size = await handle.stat().then((s) => s.size);
      if (size < offset) {
        // Truncated or rotated: start over from the beginning.
        offset = 0;
        nextLine = 0;
        yield { line: -1, text: "__TRUNCATED__" };
        continue;
      }
      if (size === offset) continue;

      const buffer = new Uint8Array(size - offset);
      const read = await handle.read(buffer, 0, buffer.length, offset).then((r) => r.bytesRead);
      offset += read;

      for (const text of assembler.push(buffer.subarray(0, read))) {
        yield { line: nextLine++, text };
      }
    }
  } finally {
    await handle.close();
  }
}
