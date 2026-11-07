import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { SpotifyClient } from "../spotify-client.js";
import { guarded, jsonResult } from "./shared.js";

export const LIST_DEVICES_TOOL = "list_devices";

/** Read-only: needs only `user-read-playback-state`, available in every mode. */
export function registerDevices(server: McpServer, client: SpotifyClient): void {
  server.registerTool(
    LIST_DEVICES_TOOL,
    {
      title: "List devices",
      description:
        "List the user's available Spotify Connect devices (phone, computer, speaker). Returns the `id` to pass as `device_id` to `play` or `transfer_playback`. A device only appears while its Spotify app is open.",
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () =>
      guarded(async () => {
        const devices = await client.listDevices();
        return jsonResult({
          devices: devices.map((d) => ({
            id: d.id ?? null,
            name: d.name,
            type: d.type ?? null,
            active: d.is_active ?? false,
            restricted: d.is_restricted ?? false,
            volumePercent: d.volume_percent ?? null,
          })),
          ...(devices.length === 0 && {
            message:
              "No devices found. Open the Spotify app on a phone, computer or speaker (and start playback once), then try again.",
          }),
        });
      }),
  );
}
