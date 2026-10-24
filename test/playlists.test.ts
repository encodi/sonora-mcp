import { describe, expect, it } from "vitest";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const playlist = (n: number, extra: Record<string, unknown> = {}) => ({
  id: `pl${n}`,
  name: `Playlist ${n}`,
  uri: `spotify:playlist:pl${n}`,
  description: "",
  owner: { id: "me", display_name: "Enrique" },
  public: false,
  collaborative: false,
  items: { total: n * 10 },
  external_urls: { spotify: `https://open.spotify.com/playlist/pl${n}` },
  ...extra,
});

describe("get_playlists (#12)", () => {
  it("is not registered in read-only mode (needs the library or playlists mode)", async () => {
    const { client, fetchMock } = await connect("read-only");
    const res = await client.callTool({ name: "get_playlists", arguments: {} });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns compact playlists with paging info (default limit 20)", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({
        total: 45,
        items: [
          playlist(1),
          null,
          playlist(2, { items: undefined, tracks: { total: 7 }, description: "Chill" }),
        ],
      }),
    ]);
    const res = await client.callTool({ name: "get_playlists", arguments: {} });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      total: 45,
      offset: 0,
      limit: 20,
      hasMore: true,
      nextOffset: 2,
      playlists: [
        {
          id: "pl1",
          name: "Playlist 1",
          uri: "spotify:playlist:pl1",
          owner: "Enrique",
          public: false,
          collaborative: false,
          trackCount: 10,
          url: "https://open.spotify.com/playlist/pl1",
        },
        {
          id: "pl2",
          name: "Playlist 2",
          uri: "spotify:playlist:pl2",
          owner: "Enrique",
          public: false,
          collaborative: false,
          trackCount: 7,
          description: "Chill",
          url: "https://open.spotify.com/playlist/pl2",
        },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/v1/me/playlists");
    expect(call.url.searchParams.get("limit")).toBe("20");
    expect(call.url.searchParams.get("offset")).toBe("0");
  });

  it("passes limit/offset and rejects limit > 50, negative offset and unknown params locally", async () => {
    const { client, fetchMock } = await connect("playlists", [
      jsonResponse({ total: 3, items: [playlist(1)] }),
    ]);
    const ok = await client.callTool({
      name: "get_playlists",
      arguments: { limit: 50, offset: 2 },
    });
    expect(JSON.parse(text(ok))).toMatchObject({ hasMore: false, offset: 2, limit: 50 });
    expect(callOf(fetchMock, 0).url.searchParams.get("limit")).toBe("50");
    for (const args of [{ limit: 51 }, { limit: 0 }, { offset: -1 }, { page: 2 }]) {
      const bad = await client.callTool({ name: "get_playlists", arguments: args });
      expect(bad.isError).toBe(true);
    }
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns a clean error on an unexpected response", async () => {
    const { client } = await connect("library", [jsonResponse({ nope: 1 })]);
    const res = await client.callTool({ name: "get_playlists", arguments: {} });
    expect(res.isError).toBe(true);
    expect(text(res)).toMatch(/unexpected playlists response/);
  });
});
