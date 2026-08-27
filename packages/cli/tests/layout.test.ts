import { describe, expect, test } from "bun:test";
import { resolvePanels } from "../src/dashboard/layout.js";

describe("dashboard layout", () => {
  test("defaults to all panels in stable order", () => expect(resolvePanels()).toEqual(["stats", "rate", "groups", "entries"]));
  test("rejects unknown and duplicate panels", () => {
    expect(() => resolvePanels(["stats", "nope"])).toThrow("Unknown dashboard panel");
    expect(() => resolvePanels(["stats", "stats"])).toThrow("cannot be duplicated");
  });
});
