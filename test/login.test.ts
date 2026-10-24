import { stat } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { loadConfig } from "../src/config.js";
import { login } from "../src/login.js";
import { TokenStore } from "../src/token-store.js";
import { FAKE_CLIENT_ID, freePort, jsonResponse, tempDir } from "./helpers.js";

describe("login flow (fully mocked Spotify)", () => {
  it("runs PKCE end to end, validates state and stores 0600 tokens", async () => {
    const port = await freePort();
    const config = loadConfig({
      SPOTIFY_CLIENT_ID: FAKE_CLIENT_ID,
      SPOTIFY_REDIRECT_PORT: String(port),
    });
    const store = new TokenStore((await tempDir()) + "/sonora-mcp");
    const tokenFetch = vi.fn(() =>
      Promise.resolve(
        jsonResponse({
          access_token: "A",
          token_type: "Bearer",
          expires_in: 3600,
          refresh_token: "R",
          scope: "user-read-playback-state user-read-currently-playing",
        }),
      ),
    );
    const printed: string[] = [];

    const open = (authorizeUrl: string): void => {
      const u = new URL(authorizeUrl);
      expect(u.searchParams.get("redirect_uri")).toBe(`http://127.0.0.1:${port}/callback`);
      const state = u.searchParams.get("state") ?? "";
      // Simulate the browser: first a forged callback, then the genuine one.
      void (async () => {
        await fetch(`http://127.0.0.1:${port}/callback?code=forged&state=wrong`);
        await fetch(`http://127.0.0.1:${port}/callback?code=GOOD&state=${state}`);
      })();
    };

    const scopes = await login({
      config,
      store,
      print: (l) => printed.push(l),
      open,
      fetch: tokenFetch,
      timeoutMs: 5000,
    });

    expect(scopes).toEqual(["user-read-playback-state", "user-read-currently-playing"]);
    const sent = (tokenFetch.mock.calls[0] as unknown as [string, RequestInit])[1]
      .body as URLSearchParams;
    expect(sent.get("code")).toBe("GOOD");
    expect(sent.get("code_verifier")).toBeTruthy();
    expect((await store.load())?.refreshToken).toBe("R");
    if (process.platform !== "win32") {
      expect((await stat(store.file)).mode & 0o777).toBe(0o600);
    }
    expect(printed.join("\n")).toContain("https://accounts.spotify.com/authorize");
    expect(printed.join("\n")).not.toMatch(/access_token|"R"/);
  });
});
