import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { SonoraError } from "../errors.js";
import { redactSecrets } from "../redact.js";

export function jsonResult(data: unknown): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(data, null, 2) }] };
}

export function errorResult(error: unknown): CallToolResult {
  const message =
    error instanceof SonoraError
      ? error.message
      : "Unexpected internal error. Check the server logs (stderr).";
  return { isError: true, content: [{ type: "text", text: redactSecrets(message) }] };
}

/** Runs a tool body, converting any failure into a clean MCP error result. */
export async function guarded(body: () => Promise<CallToolResult>): Promise<CallToolResult> {
  try {
    return await body();
  } catch (error) {
    return errorResult(error);
  }
}
