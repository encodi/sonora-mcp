import { describe, expect, it } from "vitest";
import { toolNamesForMode } from "../src/tools/index.js";
import { connect, jsonResponse, text } from "./helpers.js";

describe("tool registration by mode", () => {
  it("read-only registers only read tools (no write tools)", async () => {
    const { client } = await connect("read-only");
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["list_devices", "now_playing", "search"]);
    expect(names).toEqual([...toolNamesForMode("read-only")].sort());
    await expect(client.callTool({ name: "play", arguments: {} })).resolves.toMatchObject({
      isError: true,
    });
  });

  it("playback also registers the write tools", async () => {
    const { client } = await connect("playback");
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual([
      "list_devices",
      "now_playing",
      "pause",
      "play",
      "search",
      "transfer_playback",
    ]);
    expect(tools.find((t) => t.name === "search")?.annotations?.readOnlyHint).toBe(true);
    expect(tools.find((t) => t.name === "play")?.annotations?.readOnlyHint).toBe(false);
  });
});

describe("tool behaviour", () => {
  it("search returns compact JSON and rejects limit > 10 at the schema", async () => {
    const { client } = await connect("read-only", [
      jsonResponse({
        tracks: {
          items: [
            {
              id: "1",
              name: "Creep",
              uri: "spotify:track:1",
              artists: [{ name: "Radiohead" }],
              album: { name: "Pablo Honey" },
            },
          ],
        },
      }),
    ]);
    const ok = await client.callTool({ name: "search", arguments: { query: "creep" } });
    expect(JSON.parse(text(ok))).toMatchObject({
      tracks: [{ name: "Creep", artists: ["Radiohead"], album: "Pablo Honey" }],
      limit: 5,
    });
    const bad = await client.callTool({ name: "search", arguments: { query: "creep", limit: 50 } });
    expect(bad.isError).toBe(true);
  });

  describe("search type selection (#32)", () => {
    const artistsBody = {
      artists: { items: [{ id: "1", name: "Soda Stereo", uri: "spotify:artist:1" }] },
    };
    const requestedType = (fetchMock: { mock: { calls: unknown[][] } }): string | null =>
      new URL(String((fetchMock.mock.calls[0] as [URL])[0])).searchParams.get("type");

    it("requests artists for types: ['artist']", async () => {
      const { client, fetchMock } = await connect("read-only", [jsonResponse(artistsBody)]);
      const res = await client.callTool({
        name: "search",
        arguments: { query: "Soda Stereo", types: ["artist"] },
      });
      expect(requestedType(fetchMock)).toBe("artist");
      expect(JSON.parse(text(res))).toMatchObject({
        artists: [{ name: "Soda Stereo" }],
        types: ["artist"],
      });
    });

    it("accepts the singular alias `type` (string or array) and a single-string `types`", async () => {
      for (const args of [{ type: "artist" }, { type: ["artist"] }, { types: "artist" }]) {
        const { client, fetchMock } = await connect("read-only", [jsonResponse(artistsBody)]);
        const res = await client.callTool({
          name: "search",
          arguments: { query: "Soda Stereo", ...args },
        });
        expect(res.isError).toBeFalsy();
        expect(requestedType(fetchMock)).toBe("artist");
        expect(JSON.parse(text(res))).toMatchObject({ artists: [{ name: "Soda Stereo" }] });
      }
    });

    it("still defaults to tracks when neither is given", async () => {
      const { client, fetchMock } = await connect("read-only", [
        jsonResponse({ tracks: { items: [] } }),
      ]);
      await client.callTool({ name: "search", arguments: { query: "x" } });
      expect(requestedType(fetchMock)).toBe("track");
    });

    it("rejects both `types` and `type`, invalid values and unknown parameters (no silent fallback)", async () => {
      const { client, fetchMock } = await connect("read-only");
      const both = await client.callTool({
        name: "search",
        arguments: { query: "x", type: "artist", types: ["album"] },
      });
      expect(both.isError).toBe(true);
      expect(text(both)).toMatch(/either `types` or its alias `type`/);
      const badValue = await client.callTool({
        name: "search",
        arguments: { query: "x", type: "podcast" },
      });
      expect(badValue.isError).toBe(true);
      const unknown = await client.callTool({
        name: "search",
        arguments: { query: "x", kind: "artist" },
      });
      expect(unknown.isError).toBe(true);
      expect(text(unknown)).toMatch(/kind/);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it("documents `types` as an array with an example", async () => {
      const { client } = await connect("read-only");
      const tool = (await client.listTools()).tools.find((t) => t.name === "search");
      const props = tool?.inputSchema.properties as Record<string, { description?: string }>;
      expect(props["types"]?.description).toMatch(/ARRAY.*\["artist"\]/);
      expect(props["type"]).toBeDefined();
    });
  });

  it("now_playing reports nothing playing on 204", async () => {
    const { client } = await connect("read-only", [new Response(null, { status: 204 })]);
    const res = await client.callTool({ name: "now_playing", arguments: {} });
    const body = JSON.parse(text(res)) as Record<string, unknown>;
    expect(body).toMatchObject({ playing: false, activeDevice: false });
    expect(body["message"]).toMatch(/No active Spotify device/);
  });

  it("now_playing reports an active device with nothing loaded, naming only the device (#35)", async () => {
    const { client } = await connect("read-only", [
      jsonResponse({
        is_playing: false,
        device: {
          id: "0123456789abcdef0123456789abcdef01234567",
          name: "Pixel 8 Pro",
          type: "Smartphone",
          is_active: true,
          volume_percent: 40,
        },
        item: null,
      }),
    ]);
    const res = await client.callTool({ name: "now_playing", arguments: {} });
    const raw = text(res);
    expect(JSON.parse(raw)).toMatchObject({
      playing: false,
      activeDevice: true,
      device: { name: "Pixel 8 Pro", type: "Smartphone", volumePercent: 40 },
    });
    expect((JSON.parse(raw) as { message: string }).message).toBe(
      'Device "Pixel 8 Pro" is active, but nothing is loaded or playing on it.',
    );
    expect(raw).not.toMatch(/0123456789abcdef|"id"|token/i);
  });

  it("now_playing treats an empty state without a device as no active device", async () => {
    const { client } = await connect("read-only", [
      jsonResponse({ is_playing: false, item: null, device: null }),
    ]);
    const res = await client.callTool({ name: "now_playing", arguments: {} });
    expect(JSON.parse(text(res))).toMatchObject({ playing: false, activeDevice: false });
  });

  it("now_playing summarises the current track", async () => {
    const { client } = await connect("read-only", [
      jsonResponse({
        is_playing: true,
        progress_ms: 1000,
        device: { name: "Kitchen", type: "Speaker" },
        item: {
          type: "track",
          name: "Song",
          uri: "spotify:track:1",
          duration_ms: 2000,
          artists: [{ name: "A" }],
          album: { name: "Alb" },
        },
      }),
    ]);
    const res = await client.callTool({ name: "now_playing", arguments: {} });
    expect(JSON.parse(text(res))).toMatchObject({
      playing: true,
      name: "Song",
      artists: ["A"],
      device: { name: "Kitchen" },
    });
  });

  it("play validates URIs and calls Spotify; pause works", async () => {
    const { client, fetchMock } = await connect("playback");
    const bad = await client.callTool({ name: "play", arguments: { uri: "https://evil" } });
    expect(bad.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    const ok = await client.callTool({
      name: "play",
      arguments: { uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC" },
    });
    expect(ok.isError).toBeFalsy();
    const paused = await client.callTool({ name: "pause", arguments: {} });
    expect(JSON.parse(text(paused))).toMatchObject({ ok: true, action: "paused" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("turns Spotify failures into clean tool errors", async () => {
    const { client } = await connect("playback", [
      jsonResponse(
        { error: { status: 404, message: "m", reason: "NO_ACTIVE_DEVICE" } },
        { status: 404 },
      ),
    ]);
    const res = await client.callTool({ name: "pause", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/No active Spotify device/);
  });
});
