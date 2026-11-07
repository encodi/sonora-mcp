import { describe, expect, it } from "vitest";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const DEVICE_ID = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";

describe("list_devices (#18)", () => {
  it("is available in read-only mode and returns compact device info", async () => {
    const { client, fetchMock } = await connect("read-only", [
      jsonResponse({
        devices: [
          {
            id: DEVICE_ID,
            is_active: true,
            is_restricted: false,
            name: "Pixel 8 Pro",
            type: "Smartphone",
            volume_percent: 40,
          },
          { id: null, name: "Weird", type: "Speaker" },
        ],
      }),
    ]);
    const res = await client.callTool({ name: "list_devices", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      devices: [
        {
          id: DEVICE_ID,
          name: "Pixel 8 Pro",
          type: "Smartphone",
          active: true,
          restricted: false,
          volumePercent: 40,
        },
        {
          id: null,
          name: "Weird",
          type: "Speaker",
          active: false,
          restricted: false,
          volumePercent: null,
        },
      ],
    });
    expect(callOf(fetchMock, 0)).toMatchObject({ method: "GET" });
    expect(callOf(fetchMock, 0).url.pathname).toBe("/v1/me/player/devices");
  });

  it("explains what to do when there are no devices", async () => {
    const { client } = await connect("read-only", [jsonResponse({ devices: [] })]);
    const res = await client.callTool({ name: "list_devices", arguments: {} });
    const body = JSON.parse(text(res)) as { devices: unknown[]; message: string };
    expect(body.devices).toEqual([]);
    expect(body.message).toMatch(/Open the Spotify app/);
  });

  it("returns a clean error on an unexpected response shape", async () => {
    const { client } = await connect("read-only", [jsonResponse({ nope: true })]);
    const res = await client.callTool({ name: "list_devices", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/unexpected devices response/);
  });
});

describe("transfer_playback (#18)", () => {
  it("is not registered in read-only mode", async () => {
    const { client, fetchMock } = await connect("read-only");
    const res = await client.callTool({
      name: "transfer_playback",
      arguments: { device_id: DEVICE_ID },
    });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends PUT /me/player with a single device id and optional play", async () => {
    const { client, fetchMock } = await connect("playback");
    const res = await client.callTool({
      name: "transfer_playback",
      arguments: { device_id: DEVICE_ID, play: true },
    });
    expect(res.isError).toBeFalsy();
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/v1/me/player");
    expect(call.body).toEqual({ device_ids: [DEVICE_ID], play: true });
    // The id is never echoed back in the tool output.
    expect(text(res)).not.toContain(DEVICE_ID);
    expect(JSON.parse(text(res))).toEqual({ ok: true, action: "transferred", play: true });
  });

  it("omits `play` when not given and validates the device id locally", async () => {
    const { client, fetchMock } = await connect("playback");
    await client.callTool({ name: "transfer_playback", arguments: { device_id: DEVICE_ID } });
    expect(callOf(fetchMock, 0).body).toEqual({ device_ids: [DEVICE_ID] });
    const bad = await client.callTool({
      name: "transfer_playback",
      arguments: { device_id: "../../me" },
    });
    expect(bad.isError).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a clean error when the device is gone", async () => {
    const { client } = await connect("playback", [
      jsonResponse({ error: { status: 404, message: "Device not found" } }, { status: 404 }),
    ]);
    const res = await client.callTool({
      name: "transfer_playback",
      arguments: { device_id: DEVICE_ID },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/404/);
  });
});
