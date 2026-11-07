import { describe, expect, it } from "vitest";
import { callOf, connect, text } from "./helpers.js";

const TRACK = "spotify:track:4uLU6hMCjMI75M1A2tKUQC";
const ALBUM = "spotify:album:1DFixLWuPkv3KT3TnV35m3";
const ARTIST = "spotify:artist:4Z8W4fKeB5YxbusRsdQVPb";
const DEVICE_ID = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";

describe("play request bodies (#34)", () => {
  it("tracks use `uris`, albums/artists/playlists use `context_uri`", async () => {
    const { client, fetchMock } = await connect("playback");
    await client.callTool({ name: "play", arguments: { uri: TRACK } });
    await client.callTool({ name: "play", arguments: { uri: ALBUM } });
    await client.callTool({ name: "play", arguments: { uri: ARTIST } });
    expect(callOf(fetchMock, 0).body).toEqual({ uris: [TRACK] });
    expect(callOf(fetchMock, 1).body).toEqual({ context_uri: ALBUM });
    expect(callOf(fetchMock, 2).body).toEqual({ context_uri: ARTIST });
    expect(callOf(fetchMock, 0).url.pathname).toBe("/v1/me/player/play");
  });

  it("resume sends no body", async () => {
    const { client, fetchMock } = await connect("playback");
    await client.callTool({ name: "play", arguments: {} });
    expect(callOf(fetchMock, 0).body).toBeUndefined();
  });

  it("passes offset (position or uri) with an album context, and position_ms", async () => {
    const { client, fetchMock } = await connect("playback");
    await client.callTool({
      name: "play",
      arguments: { uri: ALBUM, offset: { position: 2 }, position_ms: 30000 },
    });
    await client.callTool({ name: "play", arguments: { uri: ALBUM, offset: { uri: TRACK } } });
    expect(callOf(fetchMock, 0).body).toEqual({
      context_uri: ALBUM,
      offset: { position: 2 },
      position_ms: 30000,
    });
    expect(callOf(fetchMock, 1).body).toEqual({ context_uri: ALBUM, offset: { uri: TRACK } });
  });

  it("refuses offset for tracks/artists/resume before calling Spotify", async () => {
    const { client, fetchMock } = await connect("playback");
    for (const args of [
      { uri: TRACK, offset: { position: 0 } },
      { uri: ARTIST, offset: { position: 0 } },
      { offset: { position: 0 } },
    ]) {
      const res = await client.callTool({ name: "play", arguments: args });
      expect(res.isError).toBe(true);
      expect(text(res)).toMatch(/album or playlist/);
    }
    const bad = await client.callTool({
      name: "play",
      arguments: { uri: ALBUM, offset: { position: -1 } },
    });
    expect(bad.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("play transfer_first (#34)", () => {
  it("transfers (without autoplay) then plays on the same device, in that order", async () => {
    const { client, fetchMock } = await connect("playback");
    const res = await client.callTool({
      name: "play",
      arguments: { uri: ALBUM, device_id: DEVICE_ID, transfer_first: true },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toMatchObject({ ok: true, transferredFirst: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const first = callOf(fetchMock, 0);
    expect(first.method).toBe("PUT");
    expect(first.url.pathname).toBe("/v1/me/player");
    expect(first.body).toEqual({ device_ids: [DEVICE_ID], play: false });
    const second = callOf(fetchMock, 1);
    expect(second.url.pathname).toBe("/v1/me/player/play");
    expect(second.url.searchParams.get("device_id")).toBe(DEVICE_ID);
    expect(second.body).toEqual({ context_uri: ALBUM });
  });

  it("needs a device_id and does not call Spotify without one", async () => {
    const { client, fetchMock } = await connect("playback");
    const res = await client.callTool({
      name: "play",
      arguments: { uri: TRACK, transfer_first: true },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/list_devices/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("without transfer_first only one request is made", async () => {
    const { client, fetchMock } = await connect("playback");
    await client.callTool({ name: "play", arguments: { uri: TRACK, device_id: DEVICE_ID } });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
