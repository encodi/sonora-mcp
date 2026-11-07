import { describe, expect, it } from "vitest";
import { toTrackUri } from "../src/spotify-ids.js";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const emptyResponse = () => new Response(null, { status: 200 });

const T1 = "4iV5W9uYEdYUVa79Axb7Rh";
const T2 = "1301WleyT98MSxVHPZCA6M";

describe("toTrackUri", () => {
  it("normalises ids, URIs and links; rejects garbage", () => {
    expect(toTrackUri(T1)).toBe(`spotify:track:${T1}`);
    expect(toTrackUri(`spotify:track:${T1}`)).toBe(`spotify:track:${T1}`);
    expect(toTrackUri(`https://open.spotify.com/track/${T1}?si=x`)).toBe(`spotify:track:${T1}`);
    for (const bad of ["", "spotify:album:" + T1, "a,b", `${T1},${T2}`, "../me"]) {
      expect(() => toTrackUri(bad)).toThrow(/not a Spotify track/);
    }
  });
});

describe("get_saved_tracks (#14)", () => {
  it("lists compact saved tracks with paging", async () => {
    const { client, fetchMock } = await connect("library", [
      jsonResponse({
        total: 3,
        items: [
          {
            added_at: "2026-02-02T00:00:00Z",
            track: {
              id: "a",
              name: "Song",
              uri: "spotify:track:a",
              artists: [{ name: "Ann" }],
              album: { name: "LP" },
              duration_ms: 5,
            },
          },
          null,
        ],
      }),
    ]);
    const res = await client.callTool({
      name: "get_saved_tracks",
      arguments: { limit: 2, offset: 0 },
    });
    expect(JSON.parse(text(res))).toEqual({
      total: 3,
      offset: 0,
      limit: 2,
      hasMore: true,
      nextOffset: 1,
      items: [
        {
          name: "Song",
          uri: "spotify:track:a",
          artists: ["Ann"],
          album: "LP",
          durationMs: 5,
          addedAt: "2026-02-02T00:00:00Z",
        },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.url.pathname).toBe("/v1/me/tracks");
    expect(call.url.searchParams.get("limit")).toBe("2");
  });

  it("rejects limit > 50 without a request", async () => {
    const { client, fetchMock } = await connect("library");
    const res = await client.callTool({ name: "get_saved_tracks", arguments: { limit: 51 } });
    expect(res.isError).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("save_tracks / remove_saved_tracks / check_saved_tracks (#14)", () => {
  it("save_tracks sends PUT /me/library with comma-separated URIs (deduped, normalised)", async () => {
    const { client, fetchMock } = await connect("library", [emptyResponse()]);
    const res = await client.callTool({
      name: "save_tracks",
      arguments: { tracks: [T1, `spotify:track:${T1}`, `https://open.spotify.com/track/${T2}`] },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      saved: [`spotify:track:${T1}`, `spotify:track:${T2}`],
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("PUT");
    expect(call.url.pathname).toBe("/v1/me/library");
    expect(call.url.searchParams.get("uris")).toBe(`spotify:track:${T1},spotify:track:${T2}`);
  });

  it("remove_saved_tracks sends DELETE /me/library", async () => {
    const { client, fetchMock } = await connect("library", [emptyResponse()]);
    const res = await client.callTool({ name: "remove_saved_tracks", arguments: { tracks: [T1] } });
    expect(JSON.parse(text(res))).toEqual({ removed: [`spotify:track:${T1}`] });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("DELETE");
    expect(call.url.pathname).toBe("/v1/me/library");
  });

  it("check_saved_tracks maps the boolean array back to the URIs", async () => {
    const { client, fetchMock } = await connect("library", [jsonResponse([true, false])]);
    const res = await client.callTool({
      name: "check_saved_tracks",
      arguments: { tracks: [T1, T2] },
    });
    expect(JSON.parse(text(res))).toEqual({
      tracks: [
        { uri: `spotify:track:${T1}`, saved: true },
        { uri: `spotify:track:${T2}`, saved: false },
      ],
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("GET");
    expect(call.url.pathname).toBe("/v1/me/library/contains");
  });

  it("validates input: empty, > 40, bad ids, unknown params; nothing is sent", async () => {
    const { client, fetchMock } = await connect("library");
    const many = Array.from({ length: 41 }, (_, i) => `spotify:track:${"a".repeat(10)}${i}`);
    for (const name of ["save_tracks", "remove_saved_tracks", "check_saved_tracks"]) {
      for (const args of [
        { tracks: [] },
        { tracks: many },
        { tracks: ["nope!"] },
        { tracks: [T1], extra: 1 },
        {},
      ]) {
        const res = await client.callTool({ name, arguments: args });
        expect(res.isError, `${name} ${JSON.stringify(args).slice(0, 40)}`).toBe(true);
      }
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not registered for playlists/playback/read-only modes", async () => {
    for (const mode of ["read-only", "playlists", "playback"] as const) {
      const { client } = await connect(mode);
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain("save_tracks");
      expect(names).not.toContain("get_saved_tracks");
    }
  });
});
