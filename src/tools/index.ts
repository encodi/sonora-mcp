import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Mode } from "../config.js";
import type { SpotifyClient } from "../spotify-client.js";
import { NOW_PLAYING_TOOL, registerNowPlaying } from "./now-playing.js";
import { PAUSE_TOOL, PLAY_TOOL, registerPlayback } from "./playback.js";
import { SEARCH_TOOL, registerSearch } from "./search.js";

const READ_TOOLS = [SEARCH_TOOL, NOW_PLAYING_TOOL] as const;
const WRITE_TOOLS = [PLAY_TOOL, PAUSE_TOOL] as const;

/** Single source of truth for which tools exist in each mode. */
export function toolNamesForMode(mode: Mode): readonly string[] {
  return mode === "playback" ? [...READ_TOOLS, ...WRITE_TOOLS] : READ_TOOLS;
}

/** Write tools are NOT registered at all in read-only mode (not merely rejected). */
export function registerTools(server: McpServer, client: SpotifyClient, mode: Mode): void {
  registerSearch(server, client);
  registerNowPlaying(server, client);
  if (mode === "playback") registerPlayback(server, client);
}
