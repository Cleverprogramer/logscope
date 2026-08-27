import { describe, expect, test } from "bun:test";
import { parseSgrMouse } from "../src/dashboard/mouse.js";

describe("parseSgrMouse", () => {
  test("parses left clicks and coordinates", () => {
    expect(parseSgrMouse("\x1b[<0;12;8M")).toEqual({ row: 8, column: 12, button: "left", release: false });
  });
  test("parses wheel reports", () => {
    expect(parseSgrMouse("\x1b[<64;1;2M")?.button).toBe("wheel-up");
    expect(parseSgrMouse("\x1b[<65;1;2m")?.button).toBe("wheel-down");
  });
  test("ignores ordinary input", () => expect(parseSgrMouse("q")).toBeNull());
});
