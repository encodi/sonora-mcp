import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult } from "./shared.js";

export const PLAY_TOOL = "play";
export const PAUSE_TOOL = "pause";
export const TRANSFER_PLAYBACK_TOOL = "transfer_playback";

const SPOTIFY_URI = /^spotify:(track|episode|album|artist|playlist|show):[A-Za-z0-9]{10,40}$/;

const deviceIdString = z.string().regex(/^[A-Za-z0-9]{8,64}$/, "Invalid device id");

const deviceId = deviceIdString
  .optional()
  .describe("Optional Spotify device id. Defaults to the active device.");

export const playInput = {
  uri: z
    .string()
    .regex(SPOTIFY_URI, "Expected a Spotify URI such as spotify:track:<id> or spotify:album:<id>")
    .optional()
    .describe(
      "What to play (a track/episode URI or an album/artist/playlist/show URI). Omit to resume.",
    ),
  device_id: deviceId,
};

export const pauseInput = { device_id: deviceId };

export const transferPlaybackInput = {
  device_id: deviceIdString.describe("Target device id, as returned by `list_devices`."),
  play: z
    .boolean()
    .optional()
    .describe("true: start playing on the device after the transfer. Default: keep current state."),
};

/** Write tools: only registered in `playback` mode. */
export function registerPlayback(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    PLAY_TOOL,
    {
      title: "Play",
      description:
        "Start or resume playback on the user's Spotify device. Pass a Spotify URI to play something specific. Requires Spotify Premium.",
      inputSchema: playInput,
      annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    ({ uri, device_id }) =>
      guarded(async () => {
        await client.play({
          ...(uri !== undefined && { uri }),
          ...(device_id !== undefined && { deviceId: device_id }),
        });
        return jsonResult({ ok: true, action: uri === undefined ? "resumed" : "playing", uri });
      }),
  );

  server.registerTool(
    PAUSE_TOOL,
    {
      title: "Pause",
      description: "Pause playback on the user's Spotify device. Requires Spotify Premium.",
      inputSchema: pauseInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ device_id }) =>
      guarded(async () => {
        await client.pause(device_id !== undefined ? { deviceId: device_id } : {});
        return jsonResult({ ok: true, action: "paused" });
      }),
  );

  server.registerTool(
    TRANSFER_PLAYBACK_TOOL,
    {
      title: "Transfer playback",
      description:
        "Move playback to another of the user's Spotify devices (see `list_devices`). Useful to wake a phone or speaker before `play`. Requires Spotify Premium.",
      inputSchema: transferPlaybackInput,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true,
      },
    },
    ({ device_id, play }) =>
      guarded(async () => {
        await client.transferPlayback({
          deviceId: device_id,
          ...(play !== undefined && { play }),
        });
        // The id is deliberately not echoed back (ids stay out of logs and transcripts).
        return jsonResult({ ok: true, action: "transferred", play: play ?? null });
      }),
  );
}
