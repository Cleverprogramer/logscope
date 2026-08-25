export type LoggerLevel = "debug" | "info" | "warn" | "error";
const LEVEL_RANK: Record<LoggerLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

import { appendFileSync } from "node:fs";

export interface LoggerOptions {
  /** Append NDJSON to this file instead of stdout. */
  file?: string;
  /** Minimum level to emit (default: debug). */
  level?: LoggerLevel;
  /** Fields bound to every line from this logger (service, env, ...). */
  bindings?: Record<string, unknown>;
}

export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
  /** Derive a child logger with extra bindings merged over its parent's. */
  child(bindings: Record<string, unknown>): Logger;
}

interface WriteSink {
  (line: string): void;
}

function fileSink(path: string): WriteSink {
  return (line) => appendFileSync(path, line + "\n", "utf8");
}

function stdoutSink(line: string): void {
  process.stdout.write(line + "\n");
}

/**
 * Create a structured logger whose output logscope parses natively:
 * one JSON object per line with timestamp/level/msg plus arbitrary fields.
 */
export function createLogger(options: LoggerOptions = {}): Logger {
  const minRank = LEVEL_RANK[options.level ?? "debug"];
  const sink = options.file ? fileSink(options.file) : stdoutSink;

  function emit(level: LoggerLevel, message: string, meta?: Record<string, unknown>): void {
    if (LEVEL_RANK[level] < minRank) return;

    // Field names deliberately match logscope's parser aliases:
    // timestamp + level + msg; everything else becomes metadata.
    const record: Record<string, unknown> = {
      timestamp: new Date().toISOString(),
      level,
      msg: message,
      ...options.bindings,
      ...meta,
    };
    sink(JSON.stringify(record));
  }

  return {
    debug: (m, meta) => emit("debug", m, meta),
    info: (m, meta) => emit("info", m, meta),
    warn: (m, meta) => emit("warn", m, meta),
    error: (m, meta) => emit("error", m, meta),
    child: (bindings) =>
      createLogger({ ...options, bindings: { ...options.bindings, ...bindings } }),
  };
}

export default createLogger;
