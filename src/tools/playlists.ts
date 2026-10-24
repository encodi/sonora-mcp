import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult, pageOutput, pagingInput } from "./shared.js";

export const GET_PLAYLISTS_TOOL = "get_playlists";
export const GET_PLAYLIST_ITEMS_TOOL = "get_playlist_items";

export const getPlaylistsInput = pagingInput;

export const getPlaylistItemsInput = {
  playlist_id: z
    .string()
    .trim()
    .min(1)
    .max(200)
    .describe("Playlist id, spotify:playlist:<id> URI or open.spotify.com playlist link."),
  ...pagingInput,
};

/** Needs playlist-read-private + playlist-read-collaborative (modes `library` and `playlists`). */
export function registerPlaylists(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    GET_PLAYLISTS_TOOL,
    {
      title: "Get my playlists",
      description:
        "List the user's playlists (created, followed and collaborative), 50 per page at most. Note: Spotify only returns the contents of playlists the user owns or collaborates on.",
      inputSchema: z.strictObject(getPlaylistsInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ limit, offset }) =>
      guarded(async () => {
        const page = await client.getPlaylists({ limit, offset });
        return jsonResult(
          pageOutput(
            {
              ...page,
              items: page.items.map((p) => ({
                id: p.id,
                name: p.name,
                uri: p.uri,
                owner: p.owner?.display_name ?? p.owner?.id ?? null,
                public: p.public ?? null,
                collaborative: p.collaborative ?? false,
                trackCount: p.items?.total ?? p.tracks?.total ?? null,
                ...(p.description ? { description: p.description } : {}),
                url: p.external_urls?.spotify ?? null,
              })),
            },
            "playlists",
          ),
        );
      }),
  );
}

/** Needs playlist-read-private (modes `library` and `playlists`). */
export function registerPlaylistItems(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    GET_PLAYLIST_ITEMS_TOOL,
    {
      title: "Get playlist items",
      description:
        "List the tracks/episodes of a playlist, 50 per page at most (position, name, artists, album, uri). Spotify only returns items for playlists the user owns or collaborates on.",
      inputSchema: z.strictObject(getPlaylistItemsInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ playlist_id, limit, offset }) =>
      guarded(async () => {
        const page = await client.getPlaylistItems({ playlistId: playlist_id, limit, offset });
        return jsonResult({
          ...pageOutput(
            {
              ...page,
              items: page.items.map(({ position, addedAt, isLocal, playable: p }) => ({
                position,
                type: p.type ?? "track",
                name: p.name,
                uri: p.uri,
                ...(p.artists?.length ? { artists: p.artists.map((a) => a.name) } : {}),
                ...((p.album ?? p.show) ? { album: (p.album ?? p.show)?.name } : {}),
                ...(p.duration_ms !== undefined ? { durationMs: p.duration_ms } : {}),
                ...(addedAt ? { addedAt } : {}),
                ...(isLocal ? { isLocal: true } : {}),
              })),
            },
            "items",
          ),
          ...(page.skipped > 0 && { skipped: page.skipped }),
        });
      }),
  );
}
