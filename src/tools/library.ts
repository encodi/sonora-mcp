import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { LIBRARY_MAX_URIS, type SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult, pageOutput, pagingInput } from "./shared.js";

export const GET_SAVED_TRACKS_TOOL = "get_saved_tracks";
export const CHECK_SAVED_TRACKS_TOOL = "check_saved_tracks";
export const SAVE_TRACKS_TOOL = "save_tracks";
export const REMOVE_SAVED_TRACKS_TOOL = "remove_saved_tracks";

const trackRefs = z
  .array(z.string().trim().min(1).max(200))
  .min(1)
  .max(LIBRARY_MAX_URIS)
  .describe(
    `1-${LIBRARY_MAX_URIS} tracks: spotify:track:<id> URIs, bare ids or open.spotify.com track links.`,
  );

export const savedTracksInput = pagingInput;
export const trackRefsInput = { tracks: trackRefs };

/** Needs user-library-read (mode `library`). */
export function registerLibraryRead(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    GET_SAVED_TRACKS_TOOL,
    {
      title: "Get saved tracks",
      description: "List the user's saved (liked) tracks, newest first, 50 per page at most.",
      inputSchema: z.strictObject(savedTracksInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ limit, offset }) =>
      guarded(async () => {
        const page = await client.getSavedTracks({ limit, offset });
        return jsonResult(
          pageOutput({
            ...page,
            items: page.items.map(({ addedAt, track: t }) => ({
              name: t.name,
              uri: t.uri,
              ...(t.artists?.length ? { artists: t.artists.map((a) => a.name) } : {}),
              ...(t.album ? { album: t.album.name } : {}),
              ...(t.duration_ms !== undefined ? { durationMs: t.duration_ms } : {}),
              ...(addedAt ? { addedAt } : {}),
            })),
          }),
        );
      }),
  );

  server.registerTool(
    CHECK_SAVED_TRACKS_TOOL,
    {
      title: "Check saved tracks",
      description: `Tell which of up to ${LIBRARY_MAX_URIS} tracks are already saved in the user's library.`,
      inputSchema: z.strictObject(trackRefsInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ tracks }) =>
      guarded(async () => jsonResult({ tracks: await client.checkSavedTracks(tracks) })),
  );
}

/** Needs user-library-modify (mode `library`). */
export function registerLibraryWrite(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    SAVE_TRACKS_TOOL,
    {
      title: "Save tracks",
      description: `Add up to ${LIBRARY_MAX_URIS} tracks to the user's saved tracks (idempotent: saving a saved track is harmless).`,
      inputSchema: z.strictObject(trackRefsInput),
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ tracks }) => guarded(async () => jsonResult({ saved: await client.saveTracks(tracks) })),
  );

  server.registerTool(
    REMOVE_SAVED_TRACKS_TOOL,
    {
      title: "Remove saved tracks",
      description: `Remove up to ${LIBRARY_MAX_URIS} tracks from the user's saved tracks. Only call this when the user explicitly asked to un-save those tracks.`,
      inputSchema: z.strictObject(trackRefsInput),
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ tracks }) =>
      guarded(async () => jsonResult({ removed: await client.removeSavedTracks(tracks) })),
  );
}
