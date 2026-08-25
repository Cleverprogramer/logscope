import { describe, expect, test } from "bun:test";
import { matchKnowledge, KB_RULES } from "../src/analysis/kb.js";

describe("knowledge base", () => {
  test("rules are well-formed and unique", () => {
    const ids = new Set(KB_RULES.map((r) => r.id));
    expect(ids.size).toBe(KB_RULES.length);
    for (const rule of KB_RULES) {
      expect(rule.hint.length).toBeGreaterThan(20);
      expect(rule.pattern.source.length).toBeGreaterThan(3);
    }
  });

  test("matches common failure signatures", () => {
    expect(matchKnowledge("connect ECONNREFUSED 127.0.0.1:5432").map((r) => r.id)).toContain(
      "conn-refused",
    );
    expect(matchKnowledge("Error: ENOSPC: no space left on device").map((r) => r.id)).toContain(
      "enospac",
    );
    expect(matchKnowledge("HTTP 429 Too Many Requests").map((r) => r.id)).toContain("rate-limit");
    expect(matchKnowledge("EADDRINUSE: address already in use :3000").map((r) => r.id)).toContain(
      "eaddrinuse",
    );
  });

  test("benign messages match nothing", () => {
    expect(matchKnowledge("User signed up successfully")).toHaveLength(0);
  });

  test("multiple distinct rules can fire on one message", () => {
    const ids = matchKnowledge("ETIMEDOUT after ENOSPC on disk").map((r) => r.id);
    expect(ids).toEqual(expect.arrayContaining(["etimedout", "enospac"]));
  });
});
