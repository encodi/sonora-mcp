import { describe, expect, it, vi } from "vitest";
import { SpotifyClient } from "../src/spotify-client.js";
import { jsonResponse, staticTokens } from "./helpers.js";

function make(responses: Response[]) {
  const fetchMock = vi.fn(() =>
    Promise.resolve(responses.shift() ?? new Response(null, { status: 500 })),
  );
  const tokens = staticTokens();
  const client = new SpotifyClient({ tokens, fetch: fetchMock });
  const lastCall = (i = 0): { url: URL; init: RequestInit } => {
    const [url, init] = fetchMock.mock.calls[i] as unknown as [URL, RequestInit];
    return { url, init };
  };
  return { client, fetchMock, tokens, lastCall };
}

describe("SpotifyClient.search", () => {
  it("calls /v1/search with bearer auth, joined types and default limit 5", async () => {
    const { client, lastCall } = make([
      jsonResponse({
        tracks: { items: [{ id: "1", name: "Song", uri: "spotify:track:1" }, null] },
      }),
    ]);
    const res = await client.search({ query: "radiohead", types: ["track", "album"] });
    const { url, init } = lastCall();
    expect(url.origin + url.pathname).toBe("https://api.spotify.com/v1/search");
    expect(url.searchParams.get("q")).toBe("radiohead");
    expect(url.searchParams.get("type")).toBe("track,album");
    expect(url.searchParams.get("limit")).toBe("5");
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer tok");
    expect(res.tracks).toHaveLength(1); // null entries dropped
  });

  it("refuses limits above 10 locally (Feb 2026 API change)", async () => {
    const { client, fetchMock } = make([]);
    await expect(client.search({ query: "x", types: ["track"], limit: 11 })).rejects.toThrow(
      /between 1 and 10/,
    );
    await expect(client.search({ query: "x", types: ["track"], limit: 0 })).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("SpotifyClient errors and retries", () => {
  it("refreshes once and retries on 401", async () => {
    const { client, fetchMock, tokens } = make([
      new Response(null, { status: 401 }),
      jsonResponse({ tracks: { items: [] } }),
    ]);
    await client.search({ query: "x", types: ["track"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(tokens.calls[1]).toEqual({ forceRefresh: true });
  });

  it("gives up with a login hint after a second 401", async () => {
    const { client } = make([
      new Response(null, { status: 401 }),
      new Response(null, { status: 401 }),
    ]);
    await expect(client.getPlayerState()).rejects.toThrow(/sonora-mcp login/);
  });

  it("reports rate limits with Retry-After", async () => {
    const { client } = make([new Response(null, { status: 429, headers: { "Retry-After": "7" } })]);
    await expect(client.getPlayerState()).rejects.toMatchObject({
      status: 429,
      retryAfterSeconds: 7,
      message: expect.stringContaining("7s") as unknown,
    });
  });

  it("explains NO_ACTIVE_DEVICE and PREMIUM_REQUIRED", async () => {
    const a = make([
      jsonResponse(
        { error: { status: 404, message: "x", reason: "NO_ACTIVE_DEVICE" } },
        { status: 404 },
      ),
    ]);
    await expect(a.client.pause()).rejects.toThrow(/No active Spotify device/);
    const b = make([
      jsonResponse(
        { error: { status: 403, message: "x", reason: "PREMIUM_REQUIRED" } },
        { status: 403 },
      ),
    ]);
    await expect(b.client.play()).rejects.toThrow(/Premium/);
  });

  it("explains generic 403 (Development Mode) and network errors", async () => {
    const a = make([
      jsonResponse({ error: { status: 403, message: "Forbidden" } }, { status: 403 }),
    ]);
    await expect(a.client.getPlayerState()).rejects.toThrow(/Development Mode/);
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    const client = new SpotifyClient({
      tokens: staticTokens(),
      fetch: fetchMock,
    });
    await expect(client.getPlayerState()).rejects.toMatchObject({ code: "network" });
  });
});

describe("SpotifyClient player", () => {
  it("returns null on 204 (nothing playing)", async () => {
    const { client } = make([new Response(null, { status: 204 })]);
    await expect(client.getPlayerState()).resolves.toBeNull();
  });

  it("play with a track URI sends uris; with a context URI sends context_uri", async () => {
    const t = make([new Response(null, { status: 204 })]);
    await t.client.play({ uri: "spotify:track:4uLU6hMCjMI75M1A2tKUQC", deviceId: "dev12345" });
    expect(t.lastCall().init.method).toBe("PUT");
    expect(t.lastCall().url.pathname).toBe("/v1/me/player/play");
    expect(t.lastCall().url.searchParams.get("device_id")).toBe("dev12345");
    expect(JSON.parse(t.lastCall().init.body as string)).toEqual({
      uris: ["spotify:track:4uLU6hMCjMI75M1A2tKUQC"],
    });
    const a = make([new Response(null, { status: 204 })]);
    await a.client.play({ uri: "spotify:album:4uLU6hMCjMI75M1A2tKUQC" });
    expect(JSON.parse(a.lastCall().init.body as string)).toEqual({
      context_uri: "spotify:album:4uLU6hMCjMI75M1A2tKUQC",
    });
  });

  it("resume sends no body; pause hits /me/player/pause", async () => {
    const r = make([new Response(null, { status: 204 })]);
    await r.client.play();
    expect(r.lastCall().init.body).toBeUndefined();
    const p = make([new Response(null, { status: 204 })]);
    await p.client.pause();
    expect(p.lastCall().url.pathname).toBe("/v1/me/player/pause");
  });
});
