import { describe, expect, test } from "bun:test";
import { completionCommand } from "../src/commands/completion.js";

describe("completion", () => {
  test("bash script completes subcommands and flags", () => {
    const script = completionCommand("bash");
    expect(script).toContain("_logscope_completions");
    expect(script).toContain("read tail stats dashboard");
    expect(script).toContain("--alert-rate");
  });

  test("zsh script defines compdef", () => {
    expect(completionCommand("zsh")).toContain("compdef _logscope logscope");
  });

  test("fish script registers per-subcommand completions", () => {
    const script = completionCommand("fish");
    expect(script).toContain("__fish_use_subcommand");
    expect(script).toContain("-a 'spikes'");
  });

  test("unknown shell → friendly error", () => {
    expect(() => completionCommand("powershell")).toThrow(/Unknown shell/);
  });
});
