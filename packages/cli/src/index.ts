#!/usr/bin/env bun
import { Command } from "commander";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerReadCommand } from "./commands/read.js";
import { registerStatsCommand } from "./commands/stats.js";
import { registerTailCommand } from "./commands/tail.js";

const program = new Command();

program
  .name("logscope")
  .description("Terminal-based log analysis & observability toolkit")
  .version("0.1.0");

registerReadCommand(program);
registerTailCommand(program);
registerStatsCommand(program);
registerDashboardCommand(program);

program.parse(process.argv);
