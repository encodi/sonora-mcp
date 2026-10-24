#!/usr/bin/env node
import { formatFatal, run } from "./cli.js";
import { createLogger, parseLogLevel } from "./logger.js";

run(process.argv.slice(2), process.env).catch((error: unknown) => {
  process.stderr.write(`sonora-mcp: ${formatFatal(error)}\n`);
  createLogger(parseLogLevel(process.env["SONORA_LOG_LEVEL"])).debug("fatal", error);
  process.exitCode = 1;
});
