import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { SonoraError } from "../errors.js";
import { PAGE_DEFAULT_LIMIT, PAGE_MAX_LIMIT } from "../spotify-client.js";
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

/** Shared `limit` / `offset` input for paged tools (Spotify allows limit 1-50). */
export const pagingInput = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(PAGE_MAX_LIMIT)
    .default(PAGE_DEFAULT_LIMIT)
    .describe(`Items per page, 1-${PAGE_MAX_LIMIT}.`),
  offset: z.number().int().min(0).default(0).describe("Index of the first item (for paging)."),
};

/** Standard paged output: `hasMore` tells the model whether to ask for the next offset. */
export function pageOutput(
  page: { items: unknown[]; total: number; limit: number; offset: number },
  key = "items",
): Record<string, unknown> {
  const nextOffset = page.offset + page.items.length;
  return {
    total: page.total,
    offset: page.offset,
    limit: page.limit,
    hasMore: nextOffset < page.total,
    ...(nextOffset < page.total && { nextOffset }),
    [key]: page.items,
  };
}
