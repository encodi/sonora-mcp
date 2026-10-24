import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";
import type { FetchLike } from "../src/auth.js";
import { scopesForModes, type Mode } from "../src/config.js";
import { createServer } from "../src/server.js";
import { SpotifyClient } from "../src/spotify-client.js";
import { TokenManager } from "../src/token-manager.js";
import { TokenStore } from "../src/token-store.js";
import { toolNamesForMode } from "../src/tools/index.js";
import { FAKE_CLIENT_ID, connect, sampleTokens, tempDir, text } from "./helpers.js";

describe("tools per mode (#11)", () => {
  it("read-only never exposes library/playlist tools; library and playlists never expose playback write tools", () => {
    const read = ["search", "now_playing", "list_devices"];
    expect(toolNamesForMode("read-only")).toEqual(read);
    expect(toolNamesForMode(["read-only", "library"])).toEqual([...read, "get_playlists"]);
    expect(toolNamesForMode(["playlists"])).toEqual([...read, "get_playlists"]);
  });

  it("playback (alone or combined) adds play, pause and transfer_playback", async () => {
    expect(toolNamesForMode("playback")).toEqual([
      "search",
      "now_playing",
      "list_devices",
      "play",
      "pause",
      "transfer_playback",
    ]);
    expect(toolNamesForMode(["library", "playback"])).toContain("play");
    const { client } = await connect(["library", "playback"]);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("transfer_playback");
  });
});

/** Real TokenManager + store (temp dir, fake tokens), mocked Spotify fetch. */
async function withStoredScopes(mode: Mode | Mode[], storedScopes: string[]) {
  const store = new TokenStore((await tempDir()) + "/sonora-mcp");
  await store.save(sampleTokens({ scopes: storedScopes }));
  const modes = typeof mode === "string" ? [mode] : mode;
  const tokens = new TokenManager({
    store,
    clientId: FAKE_CLIENT_ID,
    requiredScopes: scopesForModes(["read-only"]),
    modes,
  });
  const fetchMock = vi.fn<FetchLike>(() => Promise.resolve(new Response(null, { status: 204 })));
  const server = createServer({
    client: new SpotifyClient({ tokens, fetch: fetchMock }),
    modes,
    version: "0.0.0-test",
  });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, fetchMock };
}

describe("stored login missing a tool's scope (#11)", () => {
  const DEVICE = "0d1841b0976bae2a3a310dd74c0f3df354899bc8";

  it("tells the user to re-run login with the configured modes, without calling Spotify", async () => {
    // Server runs in `playback` but the stored login is the old read-only one.
    const { client, fetchMock } = await withStoredScopes("playback", [
      "user-read-playback-state",
      "user-read-currently-playing",
    ]);
    const res = await client.callTool({ name: "pause", arguments: { device_id: DEVICE } });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/user-modify-playback-state/);
    expect(text(res)).toMatch(/login --mode playback/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("only the tools that need the scope fail: read tools still work", async () => {
    const { client, fetchMock } = await withStoredScopes(
      ["library", "playback"],
      ["user-read-playback-state", "user-read-currently-playing"],
    );
    const ok = await client.callTool({ name: "now_playing", arguments: {} });
    expect(ok.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const bad = await client.callTool({ name: "pause", arguments: {} });
    expect(bad.isError).toBe(true);
    expect(text(bad)).toMatch(/login --mode library,playback/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("an existing playback login keeps working in playback mode", async () => {
    const { client, fetchMock } = await withStoredScopes("playback", [
      "user-read-playback-state",
      "user-read-currently-playing",
      "user-modify-playback-state",
    ]);
    const res = await client.callTool({ name: "pause", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
