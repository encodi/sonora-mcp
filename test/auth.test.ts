import { describe, expect, it, vi } from "vitest";
import { TOKEN_URL, buildAuthorizeUrl, exchangeCodeForTokens, refreshTokens } from "../src/auth.js";
import { createCodeChallenge } from "../src/pkce.js";
import { FAKE_CLIENT_ID, jsonResponse, sampleTokens } from "./helpers.js";

describe("buildAuthorizeUrl", () => {
  it("uses code flow + S256 PKCE, exact redirect URI, scopes and state; no secret", () => {
    const verifier = "v".repeat(64);
    const url = buildAuthorizeUrl({
      clientId: FAKE_CLIENT_ID,
      redirectUri: "http://127.0.0.1:8888/callback",
      scopes: ["a", "b"],
      state: "st",
      codeVerifier: verifier,
    });
    expect(url.origin + url.pathname).toBe("https://accounts.spotify.com/authorize");
    const p = url.searchParams;
    expect(p.get("response_type")).toBe("code");
    expect(p.get("client_id")).toBe(FAKE_CLIENT_ID);
    expect(p.get("redirect_uri")).toBe("http://127.0.0.1:8888/callback");
    expect(p.get("scope")).toBe("a b");
    expect(p.get("state")).toBe("st");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("code_challenge")).toBe(createCodeChallenge(verifier));
    expect(url.toString()).not.toContain(verifier);
    expect(p.has("client_secret")).toBe(false);
  });
});

describe("token endpoint", () => {
  const body = (fetchMock: ReturnType<typeof vi.fn>): URLSearchParams =>
    (fetchMock.mock.calls[0] as [string, RequestInit])[1].body as URLSearchParams;

  it("exchanges the code with the code_verifier and without a client secret", async () => {
    const fetchMock = vi.fn(() =>
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
    const tokens = await exchangeCodeForTokens({
      clientId: FAKE_CLIENT_ID,
      redirectUri: "http://127.0.0.1:8888/callback",
      code: "the-code",
      codeVerifier: "the-verifier",
      requestedScopes: [],
      fetch: fetchMock,
      now: () => 1_000,
    });
    expect((fetchMock.mock.calls[0] as unknown as [string])[0]).toBe(TOKEN_URL);
    const sent = body(fetchMock);
    expect(sent.get("grant_type")).toBe("authorization_code");
    expect(sent.get("code_verifier")).toBe("the-verifier");
    expect(sent.get("client_id")).toBe(FAKE_CLIENT_ID);
    expect(sent.has("client_secret")).toBe(false);
    expect(tokens).toMatchObject({
      accessToken: "A",
      refreshToken: "R",
      expiresAt: 1_000 + 3_600_000,
      scopes: ["user-read-playback-state", "user-read-currently-playing"],
    });
  });

  it("maps invalid_grant to an actionable message", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ error: "invalid_grant" }, { status: 400 })),
    );
    await expect(refreshTokens({ previous: sampleTokens(), fetch: fetchMock })).rejects.toThrow(
      /sonora-mcp login/,
    );
  });

  it("keeps the old refresh token when Spotify does not rotate it", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(jsonResponse({ access_token: "NEW", token_type: "Bearer", expires_in: 60 })),
    );
    const previous = sampleTokens();
    const next = await refreshTokens({
      previous,
      fetch: fetchMock,
      now: () => 0,
    });
    expect(next.accessToken).toBe("NEW");
    expect(next.refreshToken).toBe(previous.refreshToken);
    expect(body(fetchMock).get("grant_type")).toBe("refresh_token");
    expect(body(fetchMock).has("client_secret")).toBe(false);
  });

  it("never echoes tokens in error messages", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response("<html>oops access_token=LEAK</html>", { status: 502 })),
    );
    const error = (await refreshTokens({
      previous: sampleTokens(),
      fetch: fetchMock,
    }).then(
      () => new Error("expected failure"),
      (e: unknown) => e,
    )) as Error;
    expect(error.message).not.toContain("LEAK");
    expect(error.message).toContain("502");
  });

  it("reports network failures clearly", async () => {
    const fetchMock = vi.fn(() => Promise.reject(new TypeError("fetch failed")));
    await expect(
      refreshTokens({ previous: sampleTokens(), fetch: fetchMock }),
    ).rejects.toMatchObject({ code: "network" });
  });
});
