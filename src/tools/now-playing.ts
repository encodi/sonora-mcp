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
        if (
          state === null ||
          ((state.item === null || state.item === undefined) && !state.device)
        ) {
          return jsonResult({
            playing: false,
            activeDevice: false,
            message:
              "No active Spotify device. Open Spotify on a phone, computer or speaker and start playback once (or transfer playback to a device), then try again.",
          });
        }
        if (state.item === null || state.item === undefined) {
          const idle = state.device;
          return jsonResult({
            playing: false,
            activeDevice: true,
            device: idle
              ? {
                  name: idle.name,
                  type: idle.type,
                  volumePercent: idle.volume_percent ?? undefined,
                }
              : undefined,
            message: `Device "${idle?.name ?? "unknown"}" is active, but nothing is loaded or playing on it.`,
          });
        }
        const { item, device } = state;
        return jsonResult({
          playing: state.is_playing,
          activeDevice: true,
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
