import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createIngestHandler } from "../src/commands/serve.js";
import { readLogFile } from "../src/reader.js";

describe("serve ingest", () => {
  test("POSTed lines land in the output file and parse", async () => {
    const dir = await mkdtemp(join(tmpdir(), "logscope-serve-"));
    const out = join(dir, "ingest.log");
    const handler = createIngestHandler(out);
    const port = 17600 + Math.floor(Math.random() * 1000);

    const server = Bun.serve({ port, fetch: handler });

    try {
      await fetch(`http://localhost:${port}/healthz`).then((r) => expect(r.status).toBe(200));
      await fetch(`http://localhost:${port}/logs`, {
        method: "POST",
        body: "2026-08-20T09:00:00Z ERROR Payment failed for order 1\n",
      });
      await fetch(`http://localhost:${port}/logs`, {
        method: "POST",
        body: '{"timestamp":"2026-08-20T09:01:00Z","level":"info","msg":"shipped"}\n',
      });
      await new Promise((r) => setTimeout(r, 100));

      const result = await readLogFile(out);
      expect(result.totalLines).toBe(2);
      expect(result.entries[0]!.level).toBe("ERROR");
      expect(result.entries[1]!.level).toBe("INFO");

      // Unknown route → 404
      await fetch(`http://localhost:${port}/nope`).then((r) => expect(r.status).toBe(404));
    } finally {
      server.stop(true);
      await rm(dir, { recursive: true });
    }
  }, 10_000);
});
