import { describe, expect, it } from "vitest";
import { toPlayableUri } from "../src/spotify-ids.js";
import { callOf, connect, jsonResponse, text } from "./helpers.js";

const PL = "3cEYpjA9oz9GiPac4AsH4n";
const T1 = "4iV5W9uYEdYUVa79Axb7Rh";
const EP = "512ojhOuo1ktJprKbVcKyQ";

describe("toPlayableUri", () => {
  it("accepts track/episode URIs and links; rejects bare ids and other types", () => {
    expect(toPlayableUri(`spotify:track:${T1}`)).toBe(`spotify:track:${T1}`);
    expect(toPlayableUri(`https://open.spotify.com/episode/${EP}?si=x`)).toBe(
      `spotify:episode:${EP}`,
    );
    for (const bad of [T1, "", `spotify:album:${T1}`, `spotify:track:${T1},x`, "spotify:track:"]) {
      expect(() => toPlayableUri(bad)).toThrow(/not a spotify:track/);
    }
  });
});

describe("create_playlist (#15)", () => {
  it("POSTs /me/playlists, private by default, and returns a compact result", async () => {
    const { client, fetchMock } = await connect("playlists", [
      jsonResponse(
        {
          id: PL,
          name: "Road trip",
          uri: `spotify:playlist:${PL}`,
          public: false,
          collaborative: false,
          external_urls: { spotify: `https://open.spotify.com/playlist/${PL}` },
        },
        { status: 201 },
      ),
    ]);
    const res = await client.callTool({
      name: "create_playlist",
      arguments: { name: "  Road trip ", description: "Songs" },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({
      id: PL,
      name: "Road trip",
      uri: `spotify:playlist:${PL}`,
      public: false,
      collaborative: false,
      url: `https://open.spotify.com/playlist/${PL}`,
    });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe("/v1/me/playlists");
    expect(call.body).toEqual({
      name: "Road trip",
      public: false,
      collaborative: false,
      description: "Songs",
    });
  });

  it("rejects collaborative+public, empty/long names and unknown params without any request", async () => {
    const { client, fetchMock } = await connect("playlists", []);
    for (const args of [
      { name: "x", public: true, collaborative: true },
      { name: "   " },
      { name: "x".repeat(101) },
      { name: "x", description: "d".repeat(301) },
      { name: "x", user_id: "someone" },
    ]) {
      const res = await client.callTool({ name: "create_playlist", arguments: args });
      expect(res.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("add_items_to_playlist (#15)", () => {
  it("POSTs /playlists/{id}/items with normalised URIs and optional position", async () => {
    const { client, fetchMock } = await connect("playlists", [
      jsonResponse({ snapshot_id: "snap1" }, { status: 201 }),
    ]);
    const res = await client.callTool({
      name: "add_items_to_playlist",
      arguments: {
        playlist_id: `https://open.spotify.com/playlist/${PL}`,
        uris: [`spotify:track:${T1}`, `https://open.spotify.com/episode/${EP}`],
        position: 0,
      },
    });
    expect(res.isError).toBeFalsy();
    expect(JSON.parse(text(res))).toEqual({ added: 2, snapshotId: "snap1" });
    const call = callOf(fetchMock, 0);
    expect(call.method).toBe("POST");
    expect(call.url.pathname).toBe(`/v1/playlists/${PL}/items`);
    expect(call.body).toEqual({
      uris: [`spotify:track:${T1}`, `spotify:episode:${EP}`],
      position: 0,
    });
  });

  it("validates locally: empty, >100, bad refs, bad playlist id, bad position", async () => {
    const { client, fetchMock } = await connect("playlists", []);
    const good = `spotify:track:${T1}`;
    for (const args of [
      { playlist_id: PL, uris: [] },
      { playlist_id: PL, uris: Array.from({ length: 101 }, () => good) },
      { playlist_id: PL, uris: [T1] },
      { playlist_id: "../me", uris: [good] },
      { playlist_id: PL, uris: [good], position: -1 },
      { playlist_id: PL, uris: [good], extra: 1 },
    ]) {
      const res = await client.callTool({ name: "add_items_to_playlist", arguments: args });
      expect(res.isError).toBe(true);
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("is not available in library or read-only mode (and write tools need the playlists mode)", async () => {
    for (const mode of ["read-only", "library"] as const) {
      const { client } = await connect(mode, []);
      const names = (await client.listTools()).tools.map((t) => t.name);
      expect(names).not.toContain("create_playlist");
      expect(names).not.toContain("add_items_to_playlist");
    }
    const { client } = await connect(["library", "playlists"], []);
    const names = (await client.listTools()).tools.map((t) => t.name);
    expect(names).toContain("create_playlist");
  });
});
