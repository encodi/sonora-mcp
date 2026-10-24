import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { Mode } from "../src/config.js";
import { createServer } from "../src/server.js";
import { SpotifyClient } from "../src/spotify-client.js";
import { toolNamesForMode } from "../src/tools/index.js";
import { jsonResponse, staticTokens } from "./helpers.js";

async function connect(mode: Mode, responses: Response[] = []) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(responses.shift() ?? new Response(null, { status: 204 })),
  );
  const spotify = new SpotifyClient({
    tokens: staticTokens(),
    fetch: fetchMock,
  });
  const server = createServer({ client: spotify, mode, version: "0.0.0-test" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, fetchMock };
}

const text = (result: unknown): string =>
  ((result as { content: { text: string }[] }).content[0] as { text: string }).text;

describe("tool registration by mode", () => {
  it("read-only registers only search and now_playing (no write tools)", async () => {
    const { client } = await connect("read-only");
    const names = (await client.listTools()).tools.map((t) => t.name).sort();
    expect(names).toEqual(["now_playing", "search"]);
    expect(names).toEqual([...toolNamesForMode("read-only")].sort());
    await expect(client.callTool({ name: "play", arguments: {} })).resolves.toMatchObject({
      isError: true,
    });
  });

  it("playback also registers play and pause", async () => {
    const { client } = await connect("playback");
    const tools = (await client.listTools()).tools;
    expect(tools.map((t) => t.name).sort()).toEqual(["now_playing", "pause", "play", "search"]);
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

  it("now_playing reports nothing playing on 204", async () => {
    const { client } = await connect("read-only", [new Response(null, { status: 204 })]);
    const res = await client.callTool({ name: "now_playing", arguments: {} });
    expect(JSON.parse(text(res))).toMatchObject({ playing: false });
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
