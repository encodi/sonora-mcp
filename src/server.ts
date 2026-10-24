import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Mode } from "./config.js";
import type { SpotifyClient } from "./spotify-client.js";
import { registerTools } from "./tools/index.js";

export function createServer(args: {
  client: SpotifyClient;
  mode: Mode;
  version: string;
}): McpServer {
  const server = new McpServer({ name: "sonora-mcp", version: args.version });
  registerTools(server, args.client, args.mode);
  return server;
}
