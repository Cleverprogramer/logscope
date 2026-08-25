import { describe, expect, test } from "bun:test";
import { compileFormat } from "../src/parser/custom.js";
import { parseLog } from "../src/parser/index.js";

describe("compileFormat", () => {
  test("bracketed custom layout parses all three tokens", () => {
    const parse = compileFormat("{timestamp} [{level}] {message}");
    const parsed = parse("2026-08-20 09:00:01 [WARN] Disk almost full")!;
    expect(parsed).not.toBeNull();
    expect(parsed.level).toBe("WARN");
    expect(parsed.message).toBe("Disk almost full");
    expect(parsed.timestamp?.toISOString()).toBe("2026-08-20T09:00:01.000Z");
  });

  test("message-first layouts work", () => {
    const parse = compileFormat("[{level}] {message}");
    const parsed = parse("[ERROR] Payment failed for order 8841")!;
    expect(parsed.level).toBe("ERROR");
    expect(parsed.message).toBe("Payment failed for order 8841");
  });

  test("message before other tokens uses lazy matching", () => {
    const parse = compileFormat("{msg} at {timestamp}");
    const parsed = parse("cache rebuilt at 10:30:45")!;
    expect(parsed.message).toBe("cache rebuilt");
    // "10:30:45" alone is not a full timestamp → null
    expect(parsed.timestamp).toBeNull();
    expect(parsed.level).toBe("UNKNOWN");
  });

  test("unknown level words map to UNKNOWN but still parse", () => {
    const parse = compileFormat("{level} {message}");
    const parsed = parse("SEV2 disk pressure")!;
    expect(parsed.level).toBe("UNKNOWN");
    expect(parsed.message).toBe("disk pressure");
  });

  test("non-matching lines return null", () => {
    const parse = compileFormat("{timestamp} [{level}] {message}");
    expect(parse("total garbage")).toBeNull();
  });

  test("template without message token is rejected", () => {
    expect(() => compileFormat("{timestamp} only")).toThrow(/message/);
  });

  test("parseLog accepts formatTemplate option end-to-end", () => {
    const result = parseLog(
      "<<WARN>> memory high on db-01\n<<INFO>> deploy finished",
      { formatTemplate: "<<{level}>> {msg}" },
    );
    expect(result.unparsedLines).toBe(0);
    expect(result.entries[0]!.level).toBe("WARN");
    expect(result.entries[0]!.metadata).toBeUndefined();
    expect(result.entries[1]!.level).toBe("INFO");
  });
});
