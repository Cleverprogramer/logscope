import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createLogger } from "../src/index.js";

async function withTempFile<T>(fn: (path: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(join(tmpdir(), "logscope-logger-"));
  try {
    return await fn(join(dir, "app.log"));
  } finally {
    await rm(dir, { recursive: true });
  }
}

// The full loop: logger output must parse via logscope's own parser.
const { parseJsonLine } = await import("../../cli/src/parser/json.js");

describe("logscope-logger", () => {
  test("emits NDJSON lines matching logscope's schema", async () =>
    withTempFile(async (file) => {
      const logger = createLogger({ file });
      logger.info("User signed up", { email: "a@b.com" });
      logger.error("Payment failed", { orderId: 8841 });

      const [line1, line2] = file && Bun.file(file).text ? (await Bun.file(file).text()).trim().split("\n") : [];
      expect(line1).toBeDefined();
      const record1 = JSON.parse(line1!);
      expect(record1.level).toBe("info");
      expect(record1.msg).toBe("User signed up");
      expect(record1.email).toBe("a@b.com");

      // Round-trip through logscope's parser.
      const parsed2 = parseJsonLine(line2!);
      expect(parsed2!.level).toBe("ERROR");
      expect(parsed2!.message).toBe("Payment failed");
      expect(parsed2!.metadata).toEqual({ orderId: 8841 });
    }));

  test("level filtering drops below threshold", async () =>
    withTempFile(async (file) => {
      const logger = createLogger({ file, level: "warn" });
      logger.debug("noisy");
      logger.info("fine");
      logger.warn("kept");
      const text = await Bun.file(file).text();
      expect(text).not.toContain("noisy");
      expect(text).toContain("kept");
    }));

  test("child loggers merge bindings", async () =>
    withTempFile(async (file) => {
      const base = createLogger({ file, bindings: { service: "api" } });
      const req = base.child({ requestId: "r-42" });
      req.warn("slow handler", { route: "/users" });

      const record = JSON.parse((await Bun.file(file).text()).trim());
      expect(record.service).toBe("api");
      expect(record.requestId).toBe("r-42");
      expect(record.route).toBe("/users");
    }));
});
