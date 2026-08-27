import { describe, expect, test } from "bun:test";
import {
  COMPLETION_FLAGS,
  COMPLETION_SUBCOMMANDS,
  completionCommand,
} from "../src/commands/completion.js";

const CURRENT_COMMANDS = [
  "read",
  "tail",
  "stats",
  "watch",
  "gaps",
  "spikes",
  "latency",
  "advise",
  "explain",
  "diff",
  "completion",
  "serve",
  "report",
  "correlate",
  "dashboard",
];

const CURRENT_FLAGS = [
  "--level",
  "--grep",
  "--since",
  "--tz",
  "--top",
  "--out",
  "--format",
  "--json",
  "--quiet",
  "--notify",
  "--alert-rate",
  "--window",
  "--before",
  "--after",
  "--bucket",
  "--sensitivity",
  "--min-gap",
  "--interval",
  "--poll-ms",
  "--port",
  "--md",
  "--theme",
  "--compact",
  "--verbose",
  "--ascii",
  "--icons",
  "--time-format",
  "--banner",
  "-n",
  "-o",
];

describe("completion", () => {
  test("metadata covers current commands and major flags", () => {
    expect(new Set(COMPLETION_SUBCOMMANDS)).toEqual(new Set(CURRENT_COMMANDS));
    expect(new Set(COMPLETION_FLAGS)).toEqual(new Set(CURRENT_FLAGS));
  });

  test("bash script completes subcommands and flags", () => {
    const script = completionCommand("bash");
    expect(script).toContain("_logscope_completions");
    for (const command of CURRENT_COMMANDS) expect(script).toContain(command);
    for (const flag of CURRENT_FLAGS) expect(script).toContain(flag);
  });

  test("zsh script defines compdef", () => {
    expect(completionCommand("zsh")).toContain("compdef _logscope logscope");
  });

  test("fish script registers per-subcommand completions", () => {
    const script = completionCommand("fish");
    expect(script).toContain("__fish_use_subcommand");
    expect(script).toContain("-a 'serve'");
    expect(script).toContain("-l time-format");
  });

  test("unknown shell → friendly error", () => {
    expect(() => completionCommand("powershell")).toThrow(/Unknown shell/);
  });
});
