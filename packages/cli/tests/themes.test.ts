import { describe, expect, test } from "bun:test";
import { getTheme, THEMES } from "../src/dashboard/themes.js";

describe("dashboard themes", () => {
  test("provides all built-in presets", () => {
    expect(Object.keys(THEMES)).toEqual(["default", "dracula", "solarized", "monokai", "nord"]);
    expect(getTheme("NORD").name).toBe("nord");
  });
  test("rejects unknown names", () => {
    expect(() => getTheme("missing")).toThrow("Choose default");
  });
});
