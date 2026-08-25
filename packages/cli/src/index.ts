#!/usr/bin/env bun
import { Command } from "commander";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerReadCommand } from "./commands/read.js";
import { registerStatsCommand } from "./commands/stats.js";
import { registerTailCommand } from "./commands/tail.js";
import { registerWatchCommand } from "./commands/watch.js";
import { registerGapsCommand } from "./commands/gaps.js";
import { registerSpikesCommand } from "./commands/spikes.js";
import { registerLatencyCommand } from "./commands/latency.js";

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
registerDashboardCommand(program);

program.parse(process.argv);
