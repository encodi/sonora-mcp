import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpotifyClient } from "../spotify-client.js";
import { PLAYLIST_ADD_MAX, PLAYLIST_NAME_MAX } from "../spotify-client.js";
import { guarded, jsonResult, pageOutput, pagingInput } from "./shared.js";

export const GET_PLAYLISTS_TOOL = "get_playlists";
export const GET_PLAYLIST_ITEMS_TOOL = "get_playlist_items";
export const CREATE_PLAYLIST_TOOL = "create_playlist";
export const ADD_ITEMS_TOOL = "add_items_to_playlist";

const playlistRef = z
  .string()
  .trim()
  .min(1)
  .max(200)
  .describe("Playlist id, spotify:playlist:<id> URI or open.spotify.com playlist link.");

export const getPlaylistItemsInput = {
  playlist_id: playlistRef,
  ...pagingInput,
};

export const createPlaylistInput = {
  name: z.string().trim().min(1).max(PLAYLIST_NAME_MAX).describe("Playlist name."),
  description: z.string().trim().max(300).optional().describe("Optional description (max 300)."),
  public: z
    .boolean()
    .default(false)
    .describe("Make the playlist public. Default false (private); only set true if asked."),
  collaborative: z
    .boolean()
    .default(false)
    .describe("Allow others to edit. Requires a private playlist (public=false)."),
};

export const addItemsInput = {
  playlist_id: playlistRef,
  uris: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(PLAYLIST_ADD_MAX)
    .describe(
      `1-${PLAYLIST_ADD_MAX} spotify:track:<id> / spotify:episode:<id> URIs or open.spotify.com track/episode links.`,
    ),
  position: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Insert at this 0-based position. Default: append at the end."),
};

export const getPlaylistsInput = pagingInput;

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

/** Needs playlist-modify-private + playlist-modify-public (mode `playlists`). */
export function registerPlaylistWrite(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    CREATE_PLAYLIST_TOOL,
    {
      title: "Create playlist",
      description:
        "Create a new empty playlist in the user's account (private by default). Add tracks afterwards with add_items_to_playlist. Always creates a new playlist; call it once per request.",
      inputSchema: z.strictObject(createPlaylistInput),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ name, description, public: isPublic, collaborative }) =>
      guarded(async () => {
        const created = await client.createPlaylist({
          name,
          public: isPublic,
          collaborative,
          ...(description ? { description } : {}),
        });
        return jsonResult({
          id: created.id,
          name: created.name,
          uri: created.uri,
          public: created.public ?? isPublic,
          collaborative: created.collaborative ?? collaborative,
          url: created.external_urls?.spotify ?? null,
        });
      }),
  );

  server.registerTool(
    ADD_ITEMS_TOOL,
    {
      title: "Add items to playlist",
      description:
        "Add tracks/episodes (max 100 per call) to a playlist the user owns or collaborates on. Appends by default; adding the same URI twice creates duplicates.",
      inputSchema: z.strictObject(addItemsInput),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    ({ playlist_id, uris, position }) =>
      guarded(async () => {
        const result = await client.addItemsToPlaylist({
          playlistId: playlist_id,
          uris,
          ...(position !== undefined ? { position } : {}),
        });
        return jsonResult(result);
      }),
  );
}
