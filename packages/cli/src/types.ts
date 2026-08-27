/** Severity levels recognized by logscope. */
export type LogLevel = "ERROR" | "WARN" | "INFO" | "DEBUG" | "UNKNOWN";

/** A single structured log entry extracted from one line of a log file. */
export interface LogEntry {
  /** Zero-based line number in the source file. */
  line: number;
  /** The original, unmodified line. */
  raw: string;
  /** Parsed timestamp, or null if none could be extracted. */
  timestamp: Date | null;
  /** Normalized log level. Unparseable lines are flagged as UNKNOWN. */
  level: LogLevel;
  /** The message body (everything after timestamp + level). */
  message: string;
  /** Extra key/value metadata — JSON logs only. */
  metadata?: Record<string, unknown>;
  /**
   * True when the line could not be parsed by any format handler.
   * Such entries keep their raw text and are counted separately.
   */
  unparsed: boolean;
  /** Originating file path when reading multiple sources. */
  source?: string;
}

/** Result of parsing a whole file. */
export interface ParseResult {
  entries: LogEntry[];
  totalLines: number;
  unparsedLines: number;
}

/** Options accepted by every parser implementation. */
export interface ParseOptions {
  /** Base line offset, used when parsing chunks of a larger file. Defaults to 0. */
  startLine?: number;
  /** Custom line template, e.g. "{timestamp} [{level}] {message}". */
  formatTemplate?: string;
  /** Maximum characters kept from a single physical line. Defaults to 64 KiB. */
  maxLineLength?: number;
}
