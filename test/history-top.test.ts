import { describe, expect, it } from "vitest";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const track = (n: number) => ({
  id: `t${n}`,
  name: `Song ${n}`,
  uri: `spotify:track:t${n}`,
  artists: [{ name: "Ann" }],
  album: { name: "LP" },
  duration_ms: 1000,
});

describe("get_recently_played (#16)", () => {
  it("calls /me/player/recently-played and returns compact plays with a before cursor", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({
        items: [
          { played_at: "2026-02-02T10:00:00Z", track: track(1) },
          { played_at: "2026-02-02T09:00:00Z", track: null },
          { played_at: "2026-02-02T08:00:00Z", track: track(1) },
        ],
        next: "https://api.spotify.com/v1/me/player/recently-played?before=1",
        cursors: { after: "300", before: "100" },
      }),
    ]);
    const res = await client.callTool({
      name: "get_recently_played",
      arguments: { limit: 3, before: 500 },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      hasMore: true,
      nextBefore: 100,
      items: [
        {
          playedAt: "2026-02-02T10:00:00Z",
          name: "Song 1",
          uri: "spotify:track:t1",
          artists: ["Ann"],
          album: "LP",
        },
        {
          playedAt: "2026-02-02T08:00:00Z",
          name: "Song 1",
          uri: "spotify:track:t1",
          artists: ["Ann"],
          album: "LP",
        },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/v1/me/player/recently-played");
    expect(call.url.searchParams.get("limit")).toBe("3");
    expect(call.url.searchParams.get("before")).toBe("500");
    expect(call.url.searchParams.has("after")).toBe(false);
  });

  it("rejects limit > 50, before+after, negative cursors and unknown params with no request", async () => {
    const { client, fetchMock } = await connect("library", []);
    for (const args of [{ limit: 51 }, { before: 1, after: 2 }, { before: -1 }, { offset: 1 }]) {
      const res = await client.callTool({ name: "get_recently_played", arguments: args });
      expect(res.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("get_top_items (#16)", () => {
  it("lists top tracks with time_range and paging", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({ total: 120, items: [track(1), track(2)] }),
    ]);
    const res = await client.callTool({
      name: "get_top_items",
      arguments: { type: "tracks", time_range: "short_term", limit: 2, offset: 4 },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      type: "tracks",
      timeRange: "short_term",
      total: 120,
      offset: 4,
      limit: 2,
      hasMore: true,
      nextOffset: 6,
      items: [
        { name: "Song 1", uri: "spotify:track:t1", artists: ["Ann"], album: "LP" },
        { name: "Song 2", uri: "spotify:track:t2", artists: ["Ann"], album: "LP" },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.url.pathname).toBe("/v1/me/top/tracks");
    expect(call.url.searchParams.get("time_range")).toBe("short_term");
    expect(call.url.searchParams.get("limit")).toBe("2");
    expect(call.url.searchParams.get("offset")).toBe("4");
  });

  it("lists top artists (genres, no popularity/followers) with medium_term by default", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({
        total: 1,
        items: [{ id: "a", name: "Ann", uri: "spotify:artist:a", genres: ["pop"], popularity: 9 }],
      }),
    ]);
    const res = await client.callTool({ name: "get_top_items", arguments: { type: "artists" } });
    expect(JSON.parse(text(res))).toMatchObject({
      timeRange: "medium_term",
      hasMore: false,
      items: [{ name: "Ann", uri: "spotify:artist:a", genres: ["pop"] }],
    });
    expect(text(res)).not.toContain("popularity");
    const call = callOf(fetchMock, 0);
    expect(call.url.pathname).toBe("/v1/me/top/artists");
    expect(call.url.searchParams.get("limit")).toBe("20");
  });

  it("validates type, time_range and limit locally; not available outside library mode", async () => {
    const { client, fetchMock } = await connect("library", []);
    for (const args of [
      { type: "albums" },
      { type: "tracks", time_range: "forever" },
      { type: "tracks", limit: 51 },
      { type: "tracks", limit: 0 },
    ]) {
      const res = await client.callTool({ name: "get_top_items", arguments: args });
      expect(res.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
    for (const mode of ["read-only", "playlists", "playback"] as const) {
      const { client: other } = await connect(mode, []);
      const names = (await other.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain("get_top_items");
      expect(names).not.toContain("get_recently_played");
    }
  });
});
