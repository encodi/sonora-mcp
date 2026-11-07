import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import {
  LIBRARY_MAX_URIS,
  PAGE_MAX_LIMIT,
  TIME_RANGES,
  type SpotifyClient,
} from "../spotify-client.js";
import { SonoraError } from "../errors.js";
import { errorResult, guarded, jsonResult, pageOutput, pagingInput } from "./shared.js";

export const GET_SAVED_TRACKS_TOOL = "get_saved_tracks";
export const CHECK_SAVED_TRACKS_TOOL = "check_saved_tracks";
export const GET_RECENTLY_PLAYED_TOOL = "get_recently_played";
export const GET_TOP_ITEMS_TOOL = "get_top_items";
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

export const recentlyPlayedInput = {
  limit: pagingInput.limit,
  before: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Unix ms timestamp: return plays before it (use nextBefore of the previous page)."),
  after: z
    .number()
    .int()
    .min(0)
    .optional()
    .describe("Unix ms timestamp: return plays after it. Do not combine with before."),
};

export const topItemsInput = {
  type: z.enum(["tracks", "artists"]).describe("What to rank."),
  time_range: z
    .enum(TIME_RANGES)
    .default("medium_term")
    .describe("short_term ≈ 4 weeks, medium_term ≈ 6 months, long_term ≈ 1 year."),
  ...pagingInput,
};

/** Needs user-read-recently-played (mode `library`). */
export function registerRecentlyPlayed(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    GET_RECENTLY_PLAYED_TOOL,
    {
      title: "Get recently played",
      description: `The user's recently played tracks, newest first, ${PAGE_MAX_LIMIT} per page at most. Cursor-based: for older plays pass nextBefore as before. The same track can appear several times.`,
      inputSchema: z.strictObject(recentlyPlayedInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ limit, before, after }) =>
      guarded(async () => {
        if (before !== undefined && after !== undefined) {
          return errorResult(new SonoraError("config", "Use either before or after, not both."));
        }
        const page = await client.getRecentlyPlayed({
          limit,
          ...(before !== undefined ? { before } : {}),
          ...(after !== undefined ? { after } : {}),
        });
        return jsonResult({
          hasMore: page.hasMore,
          ...(page.nextBefore ? { nextBefore: Number(page.nextBefore) } : {}),
          items: page.items.map(({ playedAt, track: t }) => ({
            playedAt,
            name: t.name,
            uri: t.uri,
            ...(t.artists?.length ? { artists: t.artists.map((a) => a.name) } : {}),
            ...(t.album ? { album: t.album.name } : {}),
          })),
        });
      }),
  );
}

/** Needs user-top-read (mode `library`). */
export function registerTopItems(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    GET_TOP_ITEMS_TOOL,
    {
      title: "Get top items",
      description: `The user's top tracks or artists for a time range, ${PAGE_MAX_LIMIT} per page at most (Spotify no longer returns popularity).`,
      inputSchema: z.strictObject(topItemsInput),
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ type, time_range, limit, offset }) =>
      guarded(async () => {
        const page = await client.getTopItems({ type, timeRange: time_range, limit, offset });
        return jsonResult({
          type,
          timeRange: time_range,
          ...pageOutput({
            ...page,
            items: page.items.map((item) => ({
              name: item.name,
              uri: item.uri,
              ...("genres" in item && item.genres?.length ? { genres: item.genres } : {}),
              ...("artists" in item && item.artists?.length
                ? { artists: item.artists.map((a) => a.name) }
                : {}),
              ...("album" in item && item.album ? { album: item.album.name } : {}),
            })),
          }),
        });
      }),
  );
}
