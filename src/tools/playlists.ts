import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult, pageOutput, pagingInput } from "./shared.js";

export const GET_PLAYLISTS_TOOL = "get_playlists";

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
