import { z } from "zod";
import { SonoraError } from "./errors.js";
import { createCodeChallenge } from "./pkce.js";
import type { StoredTokens } from "./token-store.js";

export const AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
export const TOKEN_URL = "https://accounts.spotify.com/api/token";

export type FetchLike = typeof fetch;

export interface AuthorizeParams {
  clientId: string;
  redirectUri: string;
  scopes: readonly string[];
  state: string;
  codeVerifier: string;
}

/** Authorization Code + PKCE (S256). No client secret is ever involved. */
export function buildAuthorizeUrl(params: AuthorizeParams): URL {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("scope", params.scopes.join(" "));
  url.searchParams.set("state", params.state);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("code_challenge", createCodeChallenge(params.codeVerifier));
  return url;
}

const TokenResponseSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().positive(),
  refresh_token: z.string().min(1).optional(),
  scope: z.string().optional(),
});

const TokenErrorSchema = z.object({
  error: z.string().optional(),
  error_description: z.string().optional(),
});

interface TokenRequestDeps {
  fetch?: FetchLike;
  now?: () => number;
}

async function postToken(body: URLSearchParams, deps: TokenRequestDeps) {
  const doFetch = deps.fetch ?? fetch;
  let response: Response;
  try {
    response = await doFetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (error) {
    throw new SonoraError(
      "network",
      "Could not reach accounts.spotify.com. Check your internet connection.",
      { cause: error },
    );
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = TokenErrorSchema.safeParse(json);
    const err = parsed.success ? parsed.data : {};
    if (err.error === "invalid_grant") {
      throw new SonoraError(
        "auth_failed",
        "Spotify rejected the authorization (invalid_grant): the code or refresh token is expired or revoked. Run `sonora-mcp login` again.",
      );
    }
    const detail = [err.error, err.error_description].filter(Boolean).join(": ");
    throw new SonoraError(
      "auth_failed",
      `Spotify token endpoint returned HTTP ${response.status}${detail ? ` (${detail})` : ""}.`,
    );
  }
  const parsed = TokenResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new SonoraError("auth_failed", "Spotify returned an unexpected token response.");
  }
  return parsed.data;
}

export async function exchangeCodeForTokens(
  args: {
    clientId: string;
    redirectUri: string;
    code: string;
    codeVerifier: string;
    requestedScopes: readonly string[];
  } & TokenRequestDeps,
): Promise<StoredTokens> {
  const data = await postToken(
    new URLSearchParams({
      grant_type: "authorization_code",
      code: args.code,
      redirect_uri: args.redirectUri,
      client_id: args.clientId,
      code_verifier: args.codeVerifier,
    }),
    args,
  );
  if (data.refresh_token === undefined) {
    throw new SonoraError("auth_failed", "Spotify did not return a refresh token.");
  }
  const now = (args.now ?? Date.now)();
  return {
    version: 1,
    clientId: args.clientId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: now + data.expires_in * 1000,
    scopes:
      data.scope !== undefined ? data.scope.split(" ").filter(Boolean) : [...args.requestedScopes],
  };
}

export async function refreshTokens(
  args: { previous: StoredTokens } & TokenRequestDeps,
): Promise<StoredTokens> {
  const data = await postToken(
    new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: args.previous.refreshToken,
      client_id: args.previous.clientId,
    }),
    args,
  );
  const now = (args.now ?? Date.now)();
  return {
    ...args.previous,
    accessToken: data.access_token,
    // Spotify may or may not rotate the refresh token; keep the old one if omitted.
    refreshToken: data.refresh_token ?? args.previous.refreshToken,
    expiresAt: now + data.expires_in * 1000,
    scopes: data.scope !== undefined ? data.scope.split(" ").filter(Boolean) : args.previous.scopes,
  };
}
