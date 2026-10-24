import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { SonoraError } from "./errors.js";

export type Mode = "read-only" | "playback";

export const MODES: readonly Mode[] = ["read-only", "playback"];

/** Minimal scopes per mode. `playback` is a strict superset of `read-only`. */
export const SCOPES_BY_MODE: Record<Mode, readonly string[]> = {
  "read-only": ["user-read-playback-state", "user-read-currently-playing"],
  playback: [
    "user-read-playback-state",
    "user-read-currently-playing",
    "user-modify-playback-state",
  ],
};

export const DEFAULT_MODE: Mode = "read-only";
export const DEFAULT_REDIRECT_PORT = 8888;

export interface Config {
  clientId: string;
  mode: Mode;
  redirectPort: number;
  /** Exact redirect URI to register in the Spotify dashboard. */
  redirectUri: string;
}

export function parseMode(value: string | undefined): Mode {
  if (value === undefined || value === "") return DEFAULT_MODE;
  if ((MODES as readonly string[]).includes(value)) return value as Mode;
  throw new SonoraError("config", `Invalid mode "${value}". Use one of: ${MODES.join(", ")}.`);
}

export function parsePort(value: string | undefined): number {
  if (value === undefined || value === "") return DEFAULT_REDIRECT_PORT;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new SonoraError(
      "config",
      `Invalid SPOTIFY_REDIRECT_PORT "${value}". Use an integer between 1024 and 65535.`,
    );
  }
  return port;
}

export function redirectUriForPort(port: number): string {
  // Spotify requires loopback IP literals (not "localhost") for HTTP redirect URIs.
  return `http://127.0.0.1:${port}/callback`;
}

export function loadConfig(
  env: NodeJS.ProcessEnv,
  overrides: { mode?: string | undefined } = {},
): Config {
  const clientId = env["SPOTIFY_CLIENT_ID"]?.trim();
  if (clientId === undefined || clientId === "") {
    throw new SonoraError(
      "config",
      "SPOTIFY_CLIENT_ID is not set. Create an app at https://developer.spotify.com/dashboard " +
        "and export its Client ID (no Client Secret is needed). See the README.",
    );
  }
  if (!/^[A-Za-z0-9]{16,64}$/.test(clientId)) {
    throw new SonoraError(
      "config",
      "SPOTIFY_CLIENT_ID does not look like a Spotify Client ID (expected alphanumeric, 16-64 chars).",
    );
  }
  const mode = parseMode(overrides.mode ?? env["SONORA_MODE"]);
  const redirectPort = parsePort(env["SPOTIFY_REDIRECT_PORT"]);
  return { clientId, mode, redirectPort, redirectUri: redirectUriForPort(redirectPort) };
}

/** `$XDG_CONFIG_HOME/sonora-mcp` or `~/.config/sonora-mcp` (outside any repository). */
export function configDir(env: NodeJS.ProcessEnv, home: string = homedir()): string {
  const xdg = env["XDG_CONFIG_HOME"];
  const base = xdg !== undefined && xdg !== "" && isAbsolute(xdg) ? xdg : join(home, ".config");
  return join(base, "sonora-mcp");
}
