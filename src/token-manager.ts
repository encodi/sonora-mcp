import { refreshTokens, type FetchLike } from "./auth.js";
import { SonoraError } from "./errors.js";
import type { StoredTokens, TokenStore } from "./token-store.js";

export interface TokenProvider {
  /** Returns a valid access token, refreshing it first if needed. */
  getAccessToken(options?: { forceRefresh?: boolean }): Promise<string>;
}

/** Refresh slightly before real expiry to avoid racing the server clock. */
export const EXPIRY_SKEW_MS = 60_000;

export class TokenManager implements TokenProvider {
  private readonly store: TokenStore;
  private readonly clientId: string;
  private readonly requiredScopes: readonly string[];
  private readonly fetchFn: FetchLike | undefined;
  private readonly now: () => number;
  private inflight: Promise<StoredTokens> | undefined;

  constructor(args: {
    store: TokenStore;
    clientId: string;
    requiredScopes: readonly string[];
    fetch?: FetchLike;
    now?: () => number;
  }) {
    this.store = args.store;
    this.clientId = args.clientId;
    this.requiredScopes = args.requiredScopes;
    this.fetchFn = args.fetch;
    this.now = args.now ?? Date.now;
  }

  async getAccessToken(options: { forceRefresh?: boolean } = {}): Promise<string> {
    const tokens = await this.store.load();
    if (tokens === null) {
      throw new SonoraError(
        "not_authenticated",
        "Not logged in to Spotify. Run `sonora-mcp login` in a terminal first.",
      );
    }
    if (tokens.clientId !== this.clientId) {
      throw new SonoraError(
        "not_authenticated",
        "The stored login belongs to a different SPOTIFY_CLIENT_ID. Run `sonora-mcp logout` and then `sonora-mcp login`.",
      );
    }
    const missing = this.requiredScopes.filter((scope) => !tokens.scopes.includes(scope));
    if (missing.length > 0) {
      throw new SonoraError(
        "insufficient_scope",
        `The stored login lacks the scope(s): ${missing.join(", ")}. Run \`sonora-mcp login --mode playback\` to grant them.`,
      );
    }
    const stale = tokens.expiresAt - EXPIRY_SKEW_MS <= this.now();
    if (!stale && options.forceRefresh !== true) return tokens.accessToken;
    return (await this.refresh(tokens)).accessToken;
  }

  /** Single-flight: concurrent callers share one refresh request. */
  private refresh(previous: StoredTokens): Promise<StoredTokens> {
    this.inflight ??= (async () => {
      try {
        const next = await refreshTokens({
          previous,
          ...(this.fetchFn !== undefined ? { fetch: this.fetchFn } : {}),
          now: this.now,
        });
        await this.store.save(next);
        return next;
      } finally {
        this.inflight = undefined;
      }
    })();
    return this.inflight;
  }
}
