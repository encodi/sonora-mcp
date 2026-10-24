import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult } from "./shared.js";

export const NOW_PLAYING_TOOL = "now_playing";

export function registerNowPlaying(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    NOW_PLAYING_TOOL,
    {
      title: "Now playing",
      description:
        "Get what is currently playing on the user's Spotify account (track or episode, progress and device).",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () =>
      guarded(async () => {
        const state = await client.getPlayerState();
        if (state === null || state.item === null || state.item === undefined) {
          return jsonResult({
            playing: false,
            message: "Nothing is playing and no active device was found.",
          });
        }
        const { item, device } = state;
        return jsonResult({
          playing: state.is_playing,
          type: item.type ?? state.currently_playing_type,
          name: item.name,
          artists: item.artists?.map((a) => a.name),
          album: item.album?.name,
          show: item.show?.name,
          progressMs: state.progress_ms ?? undefined,
          durationMs: item.duration_ms,
          uri: item.uri,
          url: item.external_urls?.spotify,
          shuffle: state.shuffle_state,
          repeat: state.repeat_state,
          device: device
            ? {
                name: device.name,
                type: device.type,
                volumePercent: device.volume_percent ?? undefined,
              }
            : undefined,
        });
      }),
  );
}
