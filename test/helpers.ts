import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { vi } from "vitest";
import type { FetchLike } from "../src/auth.js";
import type { Mode } from "../src/config.js";
import { createServer as createMcpServer } from "../src/server.js";
import { SpotifyClient } from "../src/spotify-client.js";
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

/** In-memory MCP client/server pair; `fetch` is mocked with the given responses (204 when exhausted). */
export async function connect(mode: Mode | readonly Mode[], responses: Response[] = []) {
  const fetchMock = vi.fn<FetchLike>(() =>
    Promise.resolve(responses.shift() ?? new Response(null, { status: 204 })),
  );
  const spotify = new SpotifyClient({
    tokens: staticTokens(),
    fetch: fetchMock,
    sleep: () => Promise.resolve(),
  });
  const server = createMcpServer({ client: spotify, modes: mode, version: "0.0.0-test" });
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "test", version: "0.0.0" });
  await Promise.all([server.connect(serverT), client.connect(clientT)]);
  return { client, fetchMock };
}

export const text = (result: unknown): string =>
  ((result as { content: { text: string }[] }).content[0] as { text: string }).text;

/** Method, URL and parsed JSON body of the n-th mocked fetch call. */
export function callOf(
  fetchMock: { mock: { calls: unknown[][] } },
  n: number,
): { method: string; url: URL; body: unknown } {
  const [url, init] = fetchMock.mock.calls[n] as [URL, RequestInit | undefined];
  return {
    method: init?.method ?? "GET",
    url: new URL(String(url)),
    body: typeof init?.body === "string" ? (JSON.parse(init.body) as unknown) : undefined,
  };
}
