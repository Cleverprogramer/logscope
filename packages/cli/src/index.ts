#!/usr/bin/env bun
import { Command } from "commander";
import { loadConfig } from "./config.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerReadCommand } from "./commands/read.js";
import { registerStatsCommand } from "./commands/stats.js";
import { registerTailCommand } from "./commands/tail.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerGapsCommand } from "./commands/gaps.js";
import { registerSpikesCommand } from "./commands/spikes.js";
import { registerLatencyCommand } from "./commands/latency.js";
import { registerAdviseCommand } from "./commands/advise.js";
import { registerExplainCommand } from "./commands/explain.js";
import { registerDiffCommand } from "./commands/diff.js";
import { registerCompletionCommand } from "./commands/completion.js";
import { registerServeCommand } from "./commands/serve.js";

const program = new Command();

program
  .name("logscope")
  .description("Terminal-based log analysis & observability toolkit")
  .version("0.1.0");

registerReadCommand(program);
registerTailCommand(program);
registerStatsCommand(program);
registerWatchCommand(program);
registerGapsCommand(program);
registerSpikesCommand(program);
registerLatencyCommand(program);
registerAdviseCommand(program);
registerExplainCommand(program);
registerDiffCommand(program);
registerCompletionCommand(program);
registerServeCommand(program);
registerDashboardCommand(program);

program.parse(process.argv);
