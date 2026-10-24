import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SCOPE, scopesForModes, type Mode } from "../config.js";
import type { SpotifyClient } from "../spotify-client.js";
import { LIST_DEVICES_TOOL, registerDevices } from "./devices.js";
import { NOW_PLAYING_TOOL, registerNowPlaying } from "./now-playing.js";
import {
  CHECK_SAVED_TRACKS_TOOL,
  GET_SAVED_TRACKS_TOOL,
  REMOVE_SAVED_TRACKS_TOOL,
  SAVE_TRACKS_TOOL,
  GET_RECENTLY_PLAYED_TOOL,
  GET_TOP_ITEMS_TOOL,
  registerLibraryRead,
  registerRecentlyPlayed,
  registerTopItems,
  registerLibraryWrite,
} from "./library.js";
import {
  ADD_ITEMS_TOOL,
  CREATE_PLAYLIST_TOOL,
  GET_PLAYLIST_ITEMS_TOOL,
  GET_PLAYLISTS_TOOL,
  registerPlaylistItems,
  registerPlaylists,
  registerPlaylistWrite,
} from "./playlists.js";
import { PAUSE_TOOL, PLAY_TOOL, TRANSFER_PLAYBACK_TOOL, registerPlayback } from "./playback.js";
import { SEARCH_TOOL, registerSearch } from "./search.js";

/**
 * A group of tools that share the same scope requirement. A group is registered only when the
 * configured modes request every scope in `scopes` (write tools do not exist in lesser modes).
 */
interface ToolGroup {
  names: readonly string[];
  /** Scopes beyond the read-only base that these tools need. */
  scopes: readonly string[];
  register: (server: McpServer, client: SpotifyClient) => void;
}

/** Single source of truth for which tools exist in each mode. */
const TOOL_GROUPS: readonly ToolGroup[] = [
  { names: [SEARCH_TOOL], scopes: [], register: registerSearch },
  { names: [NOW_PLAYING_TOOL], scopes: [], register: registerNowPlaying },
  { names: [LIST_DEVICES_TOOL], scopes: [], register: registerDevices },
  {
    names: [GET_PLAYLISTS_TOOL],
    scopes: [SCOPE.playlistReadPrivate, SCOPE.playlistReadCollaborative],
    register: registerPlaylists,
  },
  {
    names: [GET_PLAYLIST_ITEMS_TOOL],
    scopes: [SCOPE.playlistReadPrivate],
    register: registerPlaylistItems,
  },
  {
    names: [CREATE_PLAYLIST_TOOL, ADD_ITEMS_TOOL],
    scopes: [SCOPE.playlistModifyPrivate, SCOPE.playlistModifyPublic],
    register: registerPlaylistWrite,
  },
  {
    names: [GET_SAVED_TRACKS_TOOL, CHECK_SAVED_TRACKS_TOOL],
    scopes: [SCOPE.libraryRead],
    register: registerLibraryRead,
  },
  {
    names: [GET_RECENTLY_PLAYED_TOOL],
    scopes: [SCOPE.recentlyPlayed],
    register: registerRecentlyPlayed,
  },
  { names: [GET_TOP_ITEMS_TOOL], scopes: [SCOPE.topRead], register: registerTopItems },
  {
    names: [SAVE_TRACKS_TOOL, REMOVE_SAVED_TRACKS_TOOL],
    scopes: [SCOPE.libraryModify],
    register: registerLibraryWrite,
  },
  {
    names: [PLAY_TOOL, PAUSE_TOOL, TRANSFER_PLAYBACK_TOOL],
    scopes: [SCOPE.modifyPlayback],
    register: registerPlayback,
  },
];

function groupsFor(mode: Mode | readonly Mode[]): ToolGroup[] {
  const granted = new Set(scopesForModes(typeof mode === "string" ? [mode] : mode));
  return TOOL_GROUPS.filter((group) => group.scopes.every((scope) => granted.has(scope)));
}

export function toolNamesForMode(mode: Mode | readonly Mode[]): readonly string[] {
  return groupsFor(mode).flatMap((group) => group.names);
}

/** Tools whose scopes the modes do not request are NOT registered at all (not merely rejected). */
export function registerTools(
  server: McpServer,
  client: SpotifyClient,
  mode: Mode | readonly Mode[],
): void {
  for (const group of groupsFor(mode)) group.register(server, client);
}
