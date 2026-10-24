import { describe, expect, it, vi } from "vitest";
import { TokenManager } from "../src/token-manager.js";
import { TokenStore } from "../src/token-store.js";
import { FAKE_CLIENT_ID, jsonResponse, sampleTokens, tempDir } from "./helpers.js";

const READ = ["user-read-playback-state", "user-read-currently-playing"];

async function setup(tokens = sampleTokens(), requiredScopes: string[] = READ, now = Date.now()) {
  const store = new TokenStore((await tempDir()) + "/sonora-mcp");
  await store.save(tokens);
  const fetchMock = vi.fn(() =>
    Promise.resolve(
      jsonResponse({ access_token: "REFRESHED", token_type: "Bearer", expires_in: 3600 }),
    ),
  );
  const manager = new TokenManager({
    store,
    clientId: FAKE_CLIENT_ID,
    requiredScopes,
    fetch: fetchMock,
    now: () => now,
  });
  return { store, manager, fetchMock };
}

describe("TokenManager", () => {
  it("fails with guidance when not logged in", async () => {
    const store = new TokenStore((await tempDir()) + "/sonora-mcp");
    const manager = new TokenManager({ store, clientId: FAKE_CLIENT_ID, requiredScopes: READ });
    await expect(manager.getAccessToken()).rejects.toMatchObject({ code: "not_authenticated" });
  });

  it("returns a fresh token without refreshing", async () => {
    const { manager, fetchMock } = await setup();
    await expect(manager.getAccessToken()).resolves.toBe("access-token-AAA");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refreshes automatically near expiry and persists the result", async () => {
    const now = 1_000_000;
    const { manager, store, fetchMock } = await setup(
      sampleTokens({ expiresAt: now + 30_000 }),
      READ,
      now,
    );
    await expect(manager.getAccessToken()).resolves.toBe("REFRESHED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect((await store.load())?.accessToken).toBe("REFRESHED");
  });

  it("shares a single refresh between concurrent callers", async () => {
    const { manager, fetchMock } = await setup(sampleTokens({ expiresAt: 0 }));
    const results = await Promise.all([manager.getAccessToken(), manager.getAccessToken()]);
    expect(results).toEqual(["REFRESHED", "REFRESHED"]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("forces a refresh on request", async () => {
    const { manager, fetchMock } = await setup();
    await expect(manager.getAccessToken({ forceRefresh: true })).resolves.toBe("REFRESHED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("asks to re-login when the mode needs scopes the token lacks", async () => {
    const { manager } = await setup(sampleTokens(), [...READ, "user-modify-playback-state"]);
    await expect(manager.getAccessToken()).rejects.toThrow(/login --mode playback/);
  });

  it("rejects a token issued for another client id", async () => {
    const { manager } = await setup(sampleTokens({ clientId: "someotherclientid1234" }));
    await expect(manager.getAccessToken()).rejects.toThrow(/different SPOTIFY_CLIENT_ID/);
  });
});
