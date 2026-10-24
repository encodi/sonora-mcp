import { z } from "zod";
import { SonoraError, SpotifyApiError } from "./errors.js";
import type { FetchLike } from "./auth.js";
import type { TokenProvider } from "./token-manager.js";

export const API_BASE = "https://api.spotify.com/v1";

/** Spotify Development Mode (Feb 2026): GET /search accepts limit 1-10 (default 5). */
export const SEARCH_MAX_LIMIT = 10;
export const SEARCH_DEFAULT_LIMIT = 5;

export const SEARCH_TYPES = ["track", "album", "artist", "playlist"] as const;
export type SearchType = (typeof SEARCH_TYPES)[number];

const ArtistRef = z.object({ name: z.string() });
const Urls = z.object({ spotify: z.string().optional() }).optional();

const Track = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  duration_ms: z.number().optional(),
  artists: z.array(ArtistRef).optional(),
  album: z.object({ name: z.string() }).optional(),
  external_urls: Urls,
});
const Album = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  release_date: z.string().optional(),
  total_tracks: z.number().optional(),
  artists: z.array(ArtistRef).optional(),
  external_urls: Urls,
});
const Artist = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  genres: z.array(z.string()).optional(),
  external_urls: Urls,
});
const Playlist = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  description: z.string().nullish(),
  owner: z.object({ display_name: z.string().nullish() }).optional(),
  external_urls: Urls,
});

// Spotify may return `null` entries inside item arrays; drop them.
const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item.nullable()), total: z.number().optional() });

const SearchResponse = z.object({
  tracks: page(Track).optional(),
  albums: page(Album).optional(),
  artists: page(Artist).optional(),
  playlists: page(Playlist).optional(),
});

const PlayerState = z.object({
  is_playing: z.boolean(),
  progress_ms: z.number().nullish(),
  shuffle_state: z.boolean().optional(),
  repeat_state: z.string().optional(),
  currently_playing_type: z.string().optional(),
  device: z
    .object({
      name: z.string(),
      type: z.string().optional(),
      volume_percent: z.number().nullish(),
      is_active: z.boolean().optional(),
    })
    .nullish(),
  item: z
    .object({
      type: z.string().optional(),
      id: z.string().nullish(),
      name: z.string(),
      uri: z.string(),
      duration_ms: z.number().optional(),
      artists: z.array(ArtistRef).optional(),
      album: z.object({ name: z.string() }).optional(),
      show: z.object({ name: z.string(), publisher: z.string().optional() }).optional(),
      external_urls: Urls,
    })
    .nullish(),
});

export type SearchResults = {
  tracks?: z.infer<typeof Track>[];
  albums?: z.infer<typeof Album>[];
  artists?: z.infer<typeof Artist>[];
  playlists?: z.infer<typeof Playlist>[];
};
export type PlayerStateData = z.infer<typeof PlayerState>;

const compact = <T>(items: (T | null)[]): T[] => items.filter((i): i is T => i !== null);

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
}

export class SpotifyClient {
  private readonly tokens: TokenProvider;
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;

  constructor(args: { tokens: TokenProvider; fetch?: FetchLike; baseUrl?: string }) {
    this.tokens = args.tokens;
    this.fetchFn = args.fetch ?? fetch;
    this.baseUrl = args.baseUrl ?? API_BASE;
  }

  async search(args: {
    query: string;
    types: readonly SearchType[];
    limit?: number;
    offset?: number;
  }): Promise<SearchResults> {
    const limit = args.limit ?? SEARCH_DEFAULT_LIMIT;
    if (!Number.isInteger(limit) || limit < 1 || limit > SEARCH_MAX_LIMIT) {
      // Fail locally with a clear message instead of Spotify's bare "Invalid limit".
      throw new SonoraError(
        "config",
        `search limit must be an integer between 1 and ${SEARCH_MAX_LIMIT} (Spotify API change, Feb 2026). Use offset to page.`,
      );
    }
    const raw = await this.request("GET", "/search", {
      query: {
        q: args.query,
        type: args.types.join(","),
        limit,
        offset: args.offset ?? 0,
      },
    });
    const parsed = SearchResponse.safeParse(raw);
    if (!parsed.success) throw unexpected("search");
    const { tracks, albums, artists, playlists } = parsed.data;
    return {
      ...(tracks && { tracks: compact(tracks.items) }),
      ...(albums && { albums: compact(albums.items) }),
      ...(artists && { artists: compact(artists.items) }),
      ...(playlists && { playlists: compact(playlists.items) }),
    };
  }

  /** `null` when nothing is playing / no active device (HTTP 204). */
  async getPlayerState(): Promise<PlayerStateData | null> {
    const raw = await this.request("GET", "/me/player", {
      query: { additional_types: "track,episode" },
    });
    if (raw === undefined) return null;
    const parsed = PlayerState.safeParse(raw);
    if (!parsed.success) throw unexpected("player state");
    return parsed.data;
  }

  async play(args: { uri?: string; deviceId?: string } = {}): Promise<void> {
    let body: Record<string, unknown> | undefined;
    if (args.uri !== undefined) {
      const kind = /^spotify:([a-z]+):/.exec(args.uri)?.[1];
      body =
        kind === "track" || kind === "episode" ? { uris: [args.uri] } : { context_uri: args.uri };
    }
    await this.request("PUT", "/me/player/play", {
      query: { device_id: args.deviceId },
      ...(body !== undefined && { body }),
    });
  }

  async pause(args: { deviceId?: string } = {}): Promise<void> {
    await this.request("PUT", "/me/player/pause", { query: { device_id: args.deviceId } });
  }

  private async request(
    method: "GET" | "PUT",
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    let response = await this.send(method, url, options.body, await this.tokens.getAccessToken());
    if (response.status === 401) {
      // Token may have been revoked/expired early: refresh once and retry.
      response = await this.send(
        method,
        url,
        options.body,
        await this.tokens.getAccessToken({ forceRefresh: true }),
      );
    }
    if (response.status === 204) return undefined;
    if (!response.ok) throw await toApiError(response);
    const text = await response.text();
    return text === "" ? undefined : (JSON.parse(text) as unknown);
  }

  private async send(
    method: string,
    url: URL,
    body: unknown,
    accessToken: string,
  ): Promise<Response> {
    try {
      return await this.fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
          ...(body !== undefined && { "Content-Type": "application/json" }),
        },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch (error) {
      throw new SonoraError(
        "network",
        "Could not reach api.spotify.com. Check your internet connection.",
        { cause: error },
      );
    }
  }
}

function unexpected(what: string): SonoraError {
  return new SonoraError("spotify_api", `Spotify returned an unexpected ${what} response.`);
}

const ApiErrorBody = z.object({
  error: z.object({
    status: z.number().optional(),
    message: z.string().optional(),
    reason: z.string().optional(),
  }),
});

async function toApiError(response: Response): Promise<SpotifyApiError> {
  const parsed = ApiErrorBody.safeParse(await response.json().catch(() => null));
  const apiMessage = parsed.success ? parsed.data.error.message : undefined;
  const reason = parsed.success ? parsed.data.error.reason : undefined;
  const status = response.status;

  if (status === 429) {
    const retry = Number(response.headers.get("Retry-After"));
    const retryAfterSeconds = Number.isFinite(retry) && retry >= 0 ? retry : undefined;
    return new SpotifyApiError(
      status,
      `Spotify rate limit reached.${retryAfterSeconds !== undefined ? ` Retry in ${retryAfterSeconds}s.` : " Try again shortly."}`,
      { retryAfterSeconds },
    );
  }
  if (status === 404 && reason === "NO_ACTIVE_DEVICE") {
    return new SpotifyApiError(
      status,
      "No active Spotify device. Open Spotify on a phone/desktop/speaker and start playback once, then retry (or pass device_id).",
      { reason },
    );
  }
  if (status === 403 && reason === "PREMIUM_REQUIRED") {
    return new SpotifyApiError(status, "This action requires Spotify Premium.", { reason });
  }
  if (status === 403) {
    return new SpotifyApiError(
      status,
      `Spotify refused the request (403${apiMessage ? `: ${apiMessage}` : ""}). Possible causes: your account is not on the app's user allowlist (Development Mode), the owner's Premium lapsed, or the endpoint is restricted for Development Mode apps.`,
      { reason },
    );
  }
  if (status === 401) {
    return new SpotifyApiError(
      status,
      "Spotify rejected the access token. Run `sonora-mcp login` again.",
      { reason },
    );
  }
  return new SpotifyApiError(
    status,
    `Spotify API error ${status}${apiMessage ? `: ${apiMessage}` : ""}.`,
    { reason },
  );
}
