import { spawn } from "node:child_process";
import { exchangeCodeForTokens, buildAuthorizeUrl, type FetchLike } from "./auth.js";
import { startCallbackServer } from "./callback-server.js";
import { modeLabel, scopesForModes, type Config } from "./config.js";
import { createCodeVerifier, createState } from "./pkce.js";
import type { TokenStore } from "./token-store.js";

/** Best-effort browser launch; the URL is always printed too, so failures are harmless. */
export function openBrowser(url: string): void {
  const [cmd, args]: [string, string[]] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["rundll32", ["url.dll,FileProtocolHandler", url]]
        : ["xdg-open", [url]];
  try {
    const child = spawn(cmd, args, { stdio: "ignore", detached: true });
    child.on("error", () => undefined);
    child.unref();
  } catch {
    /* the printed URL is the fallback */
  }
}

export interface LoginDeps {
  config: Config;
  store: TokenStore;
  print: (line: string) => void;
  open?: ((url: string) => void) | undefined;
  fetch?: FetchLike;
  timeoutMs?: number;
}

/** Authorization Code + PKCE flow. Resolves with the scopes granted. */
export async function login(deps: LoginDeps): Promise<readonly string[]> {
  const { config } = deps;
  const scopes = scopesForModes(config.modes);
  const codeVerifier = createCodeVerifier();
  const state = createState();

  const callback = await startCallbackServer({
    port: config.redirectPort,
    expectedState: state,
    ...(deps.timeoutMs !== undefined && { timeoutMs: deps.timeoutMs }),
  });
  try {
    const url = buildAuthorizeUrl({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      scopes,
      state,
      codeVerifier,
    }).toString();
    deps.print(`Mode: ${modeLabel(config.modes)} (scopes: ${scopes.join(", ")})`);
    deps.print("Open this URL in your browser to authorize Sonora MCP:\n");
    deps.print(url + "\n");
    deps.print(`Waiting for the redirect on ${config.redirectUri} ...`);
    deps.open?.(url);

    const { code } = await callback.result;
    const tokens = await exchangeCodeForTokens({
      clientId: config.clientId,
      redirectUri: config.redirectUri,
      code,
      codeVerifier,
      requestedScopes: scopes,
      ...(deps.fetch !== undefined && { fetch: deps.fetch }),
    });
    await deps.store.save(tokens);
    return tokens.scopes;
  } finally {
    await callback.close();
  }
}
