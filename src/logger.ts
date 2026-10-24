import { redactSecrets, redactValue } from "./redact.js";

export type LogLevel = "error" | "warn" | "info" | "debug";

const ORDER: Record<LogLevel, number> = { error: 0, warn: 1, info: 2, debug: 3 };

export interface Logger {
  error(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  debug(message: string, meta?: unknown): void;
}

export function parseLogLevel(value: string | undefined): LogLevel {
  return value !== undefined && value in ORDER ? (value as LogLevel) : "info";
}

/**
 * Logger that writes to stderr only (stdout is reserved for the MCP stdio protocol).
 * Every message and metadata object is redacted before being written.
 */
export function createLogger(
  level: LogLevel = "info",
  write: (line: string) => void = (line) => process.stderr.write(`${line}\n`),
): Logger {
  const emit = (lvl: LogLevel, message: string, meta?: unknown): void => {
    if (ORDER[lvl] > ORDER[level]) return;
    const suffix = meta === undefined ? "" : ` ${JSON.stringify(redactValue(meta))}`;
    write(`[sonora-mcp] ${lvl}: ${redactSecrets(message)}${suffix}`);
  };
  return {
    error: (m, meta) => {
      emit("error", m, meta);
    },
    warn: (m, meta) => {
      emit("warn", m, meta);
    },
    info: (m, meta) => {
      emit("info", m, meta);
    },
    debug: (m, meta) => {
      emit("debug", m, meta);
    },
  };
}
