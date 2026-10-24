import { describe, expect, it } from "vitest";
import { parsePlaylistId } from "../src/spotify-ids.js";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const ID = "3cEYpjA9oz9GiPac4AsH4n";
const track = (n: number) => ({
  id: `t${n}`,
  type: "track",
  name: `Song ${n}`,
  uri: `spotify:track:t${n}`,
  duration_ms: 1000 * n,
  artists: [{ name: "Artist A" }, { name: "Artist B" }],
  album: { name: "Album" },
});

describe("parsePlaylistId", () => {
  it("accepts ids, URIs and links; rejects anything else", () => {
    expect(parsePlaylistId(ID)).toBe(ID);
    expect(parsePlaylistId(`spotify:playlist:${ID}`)).toBe(ID);
    expect(parsePlaylistId(`https://open.spotify.com/playlist/${ID}?si=abc`)).toBe(ID);
    expect(parsePlaylistId(`https://open.spotify.com/intl-es/playlist/${ID}`)).toBe(ID);
    for (const bad of [
      "",
      "../me",
      `${ID}/tracks`,
      "spotify:track:abc",
      "https://evil.test/playlist/" + ID,
    ]) {
      expect(() => parsePlaylistId(bad)).toThrow(/playlist_id/);
    }
  });
});

describe("get_playlist_items (#13)", () => {
  it("uses /playlists/{id}/items, reads `item` (falls back to deprecated `track`), skips null items", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({
        total: 4,
        items: [
          { added_at: "2026-01-01T00:00:00Z", item: track(1) },
          { item: null, track: null },
          { track: track(3), is_local: true },
          {
            item: {
              ...track(4),
              type: "episode",
              artists: undefined,
              album: undefined,
              show: { name: "Show" },
            },
          },
        ],
      }),
    ]);
    const res = await client.callTool({
      name: "get_playlist_items",
      arguments: { playlist_id: `spotify:playlist:${ID}`, limit: 4, offset: 10 },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      total: 4,
      offset: 10,
      limit: 4,
      hasMore: false,
      skipped: 1,
      items: [
        {
          position: 10,
          type: "track",
          name: "Song 1",
          uri: "spotify:track:t1",
          artists: ["Artist A", "Artist B"],
          album: "Album",
          durationMs: 1000,
          addedAt: "2026-01-01T00:00:00Z",
        },
        {
          position: 12,
          type: "track",
          name: "Song 3",
          uri: "spotify:track:t3",
          artists: ["Artist A", "Artist B"],
          album: "Album",
          durationMs: 3000,
          isLocal: true,
        },
        {
          position: 13,
          type: "episode",
          name: "Song 4",
          uri: "spotify:track:t4",
          album: "Show",
          durationMs: 4000,
        },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe(`/v1/playlists/${ID}/items`);
    expect(call.url.searchParams.get("limit")).toBe("4");
    expect(call.url.searchParams.get("offset")).toBe("10");
    expect(call.url.searchParams.get("additional_types")).toBe("track,episode");
  });

  it("explains the Feb 2026 owner/collaborator restriction on 403", async () => {
    const { client } = await connect("playlists", [
      jsonResponse({ error: { status: 403, message: "Forbidden" } }, { status: 403 }),
    ]);
    const res = await client.callTool({
      name: "get_playlist_items",
      arguments: { playlist_id: ID },
    });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/own or collaborate on/);
    expect(text(res)).toMatch(/login --mode library/);
  });

  it("rejects bad ids, limit > 50 and unknown params without any request; absent in read-only", async () => {
    const lib = await connect("library");
    for (const args of [
      { playlist_id: "../me" },
      { playlist_id: ID, limit: 51 },
      { playlist_id: ID, offset: -5 },
      { playlist_id: ID, extra: 1 },
      {},
    ]) {
      const res = await lib.client.callTool({ name: "get_playlist_items", arguments: args });
      expect(res.isError).toBe(true);
    }
    expect(lib.fetchMock).not.toHaveBeenCalled();
    const ro = await connect("read-only");
    const res = await ro.client.callTool({
      name: "get_playlist_items",
      arguments: { playlist_id: ID },
    });
    expect(res.isError).toBe(true);
    expect(ro.fetchMock).not.toHaveBeenCalled();
  });
});
