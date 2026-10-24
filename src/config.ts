import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import { SonoraError } from "./errors.js";

/** Every Spotify scope this server can ever request. Tools name the ones they need. */
export const SCOPE = {
  playbackState: "user-read-playback-state",
  currentlyPlaying: "user-read-currently-playing",
  modifyPlayback: "user-modify-playback-state",
  libraryRead: "user-library-read",
  libraryModify: "user-library-modify",
  playlistReadPrivate: "playlist-read-private",
  playlistReadCollaborative: "playlist-read-collaborative",
  playlistModifyPrivate: "playlist-modify-private",
  playlistModifyPublic: "playlist-modify-public",
  recentlyPlayed: "user-read-recently-played",
  topRead: "user-top-read",
} as const;

export type Mode = "read-only" | "library" | "playlists" | "playback";

/** Canonical order; also the order scopes are requested in. */
export const MODES: readonly Mode[] = ["read-only", "library", "playlists", "playback"];

/**
 * Scopes each mode ADDS on top of `read-only` (see docs/adr/0001-modes-and-scopes.md).
 * Modes are additive and can be combined: `--mode library,playback`.
 */
export const MODE_EXTRA_SCOPES: Record<Mode, readonly string[]> = {
  "read-only": [],
  library: [
    SCOPE.libraryRead,
    SCOPE.libraryModify,
    SCOPE.recentlyPlayed,
    SCOPE.topRead,
    SCOPE.playlistReadPrivate,
    SCOPE.playlistReadCollaborative,
  ],
  playlists: [
    SCOPE.playlistReadPrivate,
    SCOPE.playlistReadCollaborative,
    SCOPE.playlistModifyPrivate,
    SCOPE.playlistModifyPublic,
  ],
  playback: [SCOPE.modifyPlayback],
};

const BASE_SCOPES: readonly string[] = [SCOPE.playbackState, SCOPE.currentlyPlaying];

/** Scopes requested for a set of modes: the `read-only` base plus each mode's extras, deduplicated. */
export function scopesForModes(modes: readonly Mode[]): string[] {
  const wanted = new Set<string>(BASE_SCOPES);
  for (const mode of MODES) {
    if (modes.includes(mode)) for (const scope of MODE_EXTRA_SCOPES[mode]) wanted.add(scope);
  }
  return [...wanted];
}

/** Scopes of a single mode (including the read-only base). `read-only` and `playback` are unchanged from Sprint 1. */
export const SCOPES_BY_MODE: Record<Mode, readonly string[]> = {
  "read-only": scopesForModes(["read-only"]),
  library: scopesForModes(["library"]),
  playlists: scopesForModes(["playlists"]),
  playback: scopesForModes(["playback"]),
};

/** The modes to log in with so that every scope in `scopes` is covered (used in error hints). */
export function modesCovering(scopes: readonly string[]): Mode[] {
  const needed = new Set(scopes);
  const modes = MODES.filter((m) => MODE_EXTRA_SCOPES[m].some((s) => needed.has(s)));
  return modes.length > 0 ? modes : ["read-only"];
}

export const DEFAULT_MODE: Mode = "read-only";
export const DEFAULT_REDIRECT_PORT = 8888;

export interface Config {
  clientId: string;
  /** Normalised: deduplicated, canonical order, never empty. */
  modes: readonly Mode[];
  redirectPort: number;
  /** Exact redirect URI to register in the Spotify dashboard. */
  redirectUri: string;
}

export function parseMode(value: string | undefined): Mode {
  if (value === undefined || value === "") return DEFAULT_MODE;
  if ((MODES as readonly string[]).includes(value)) return value as Mode;
  throw new SonoraError("config", `Invalid mode "${value}". Use one of: ${MODES.join(", ")}.`);
}

/** Parses one mode or a comma-separated list (`library,playback`) into a normalised mode set. */
export function parseModes(value: string | undefined): Mode[] {
  const parts = (value ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  const parsed = new Set<Mode>(parts.map((part) => parseMode(part)));
  if (parsed.size === 0) parsed.add(DEFAULT_MODE);
  return MODES.filter((mode) => parsed.has(mode));
}

/** Short label for logs/errors: `read-only` is implied by every other mode, so it is dropped. */
export function modeLabel(modes: readonly Mode[]): string {
  const shown = modes.filter((m) => m !== "read-only");
  return (shown.length > 0 ? shown : modes).join(",");
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
  const modes = parseModes(overrides.mode ?? env["SONORA_MODE"]);
  const redirectPort = parsePort(env["SPOTIFY_REDIRECT_PORT"]);
  return { clientId, modes, redirectPort, redirectUri: redirectUriForPort(redirectPort) };
}

/** `$XDG_CONFIG_HOME/sonora-mcp` or `~/.config/sonora-mcp` (outside any repository). */
export function configDir(env: NodeJS.ProcessEnv, home: string = homedir()): string {
  const xdg = env["XDG_CONFIG_HOME"];
  const base = xdg !== undefined && xdg !== "" && isAbsolute(xdg) ? xdg : join(home, ".config");
  return join(base, "sonora-mcp");
}
