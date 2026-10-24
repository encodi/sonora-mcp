import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SonoraError } from "../errors.js";
import {
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_TYPES,
  type SearchType,
  type SpotifyClient,
} from "../spotify-client.js";
import { guarded, jsonResult } from "./shared.js";

export const SEARCH_TOOL = "search";

const searchTypeList = z
  .union([z.enum(SEARCH_TYPES), z.array(z.enum(SEARCH_TYPES)).min(1).max(SEARCH_TYPES.length)])
  .optional();

export const searchInput = {
  query: z.string().trim().min(1).max(250).describe("Free-text search query."),
  types: searchTypeList.describe(
    'What to search for: an ARRAY of "track" | "album" | "artist" | "playlist", e.g. ["artist"] or ["track","album"]. A single string such as "artist" is also accepted. Defaults to ["track"].',
  ),
  type: searchTypeList.describe('Alias of `types` (same values), e.g. "artist". Do not pass both.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_MAX_LIMIT)
    .default(SEARCH_DEFAULT_LIMIT)
    .describe(
      `Results per type, 1-${SEARCH_MAX_LIMIT} (Spotify caps search at ${SEARCH_MAX_LIMIT} since Feb 2026).`,
    ),
  offset: z
    .number()
    .int()
    .min(0)
    .max(1000)
    .default(0)
    .describe("Index of the first result; use it to page through more results."),
};

/** Normalises `types` / its `type` alias to a de-duplicated list (default: tracks). */
export function resolveSearchTypes(input: {
  types?: SearchType | readonly SearchType[] | undefined;
  type?: SearchType | readonly SearchType[] | undefined;
}): SearchType[] {
  if (input.types !== undefined && input.type !== undefined) {
    throw new SonoraError(
      "config",
      'Pass either `types` or its alias `type`, not both. Prefer `types` (an array, e.g. ["artist"]).',
    );
  }
  const raw = input.types ?? input.type;
  if (raw === undefined) return ["track"];
  return [...new Set(typeof raw === "string" ? [raw] : raw)] as SearchType[];
}

export function registerSearch(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    SEARCH_TOOL,
    {
      title: "Search Spotify",
      description:
        "Search the Spotify catalog for tracks, albums, artists or playlists. Returns names, URIs and links.",
      // Strict: an unknown parameter name fails loudly instead of silently falling back to tracks.
      inputSchema: z.strictObject(searchInput),
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ query, types: typesArg, type, limit, offset }) =>
      guarded(async () => {
        const types = resolveSearchTypes({ types: typesArg, type });
        const results = await client.search({ query, types, limit, offset });
        return jsonResult({
          tracks: results.tracks?.map((t) => ({
            name: t.name,
            artists: t.artists?.map((a) => a.name),
            album: t.album?.name,
            durationMs: t.duration_ms,
            uri: t.uri,
            url: t.external_urls?.spotify,
          })),
          albums: results.albums?.map((a) => ({
            name: a.name,
            artists: a.artists?.map((x) => x.name),
            releaseDate: a.release_date,
            totalTracks: a.total_tracks,
            uri: a.uri,
            url: a.external_urls?.spotify,
          })),
          artists: results.artists?.map((a) => ({
            name: a.name,
            genres: a.genres,
            uri: a.uri,
            url: a.external_urls?.spotify,
          })),
          playlists: results.playlists?.map((p) => ({
            name: p.name,
            owner: p.owner?.display_name ?? undefined,
            description: p.description ?? undefined,
            uri: p.uri,
            url: p.external_urls?.spotify,
          })),
          types,
          offset,
          limit,
        });
      }),
  );
}
