import { mkdtemp } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { TokenProvider } from "../src/token-manager.js";
import type { StoredTokens } from "../src/token-store.js";

export async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "sonora-test-"));
}

export async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.once("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address !== null ? address.port : 0;
      srv.close(() => {
        resolve(port);
      });
    });
  });
}

export const FAKE_CLIENT_ID = "abcdef0123456789abcdef0123456789";

export function sampleTokens(overrides: Partial<StoredTokens> = {}): StoredTokens {
  return {
    version: 1,
    clientId: FAKE_CLIENT_ID,
    accessToken: "access-token-AAA",
    refreshToken: "refresh-token-RRR",
    expiresAt: Date.now() + 3_600_000,
    scopes: ["user-read-playback-state", "user-read-currently-playing"],
    ...overrides,
  };
}

export function staticTokens(token = "tok"): TokenProvider & { calls: unknown[] } {
  const calls: unknown[] = [];
  return {
    calls,
    getAccessToken: (options) => {
      calls.push(options);
      return Promise.resolve(options?.forceRefresh === true ? `${token}-refreshed` : token);
    },
  };
}

export function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
    ...init,
  });
}
