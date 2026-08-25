import { describe, expect, test } from "bun:test";
import { pickNotifier, buildNotifyArgs } from "../src/notify.js";

describe("notifications", () => {
  test("platform picking", () => {
    expect(pickNotifier("darwin")).toBe("macos");
    expect(pickNotifier("linux")).toBe("linux");
    expect(pickNotifier("win32")).toBeNull();
  });

  test("argv construction per platform", () => {
    const [cmd, ...args] = buildNotifyArgs("macos", "title 'quoted'", "body");
    expect(cmd).toBe("osascript");
    expect(args[0]).toBe("-e");

    const [linuxCmd, linuxTitle, linuxBody] = buildNotifyArgs("linux", "t", "b");
    expect(linuxCmd).toBe("notify-send");
    expect(linuxTitle).toBe("t");
    expect(linuxBody).toBe("b");
  });

  test("macOS argv escapes quotes safely", () => {
    const [, , script] = buildNotifyArgs("macos", "logscope", `boom "quoted" done`);
    // JSON.stringify-style escaping keeps AppleScript parsing safe
    expect(script).toContain(`"boom \\"quoted\\" done"`);
  });
});
