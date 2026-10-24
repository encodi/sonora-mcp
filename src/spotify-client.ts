import { z } from "zod";
import { SCOPE } from "./config.js";
import { SonoraError, SpotifyApiError } from "./errors.js";
import type { FetchLike } from "./auth.js";
import { parsePlaylistId, toTrackUri } from "./spotify-ids.js";
import type { TokenProvider } from "./token-manager.js";

export const API_BASE = "https://api.spotify.com/v1";

/** Spotify Development Mode (Feb 2026): GET /search accepts limit 1-10 (default 5). */
export const SEARCH_MAX_LIMIT = 10;
export const SEARCH_DEFAULT_LIMIT = 5;

/** Paged list endpoints (playlists, library, history, top items): limit 1-50. */
export const PAGE_MAX_LIMIT = 50;
export const PAGE_DEFAULT_LIMIT = 20;

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

const Playable = z.object({
  id: z.string().nullish(),
  name: z.string(),
  uri: z.string(),
  type: z.string().optional(),
  duration_ms: z.number().optional(),
  artists: z.array(ArtistRef).optional(),
  album: z.object({ name: z.string() }).optional(),
  show: z.object({ name: z.string() }).optional(),
  external_urls: Urls,
});
const SavedTrack = z.object({ added_at: z.string().nullish(), track: Playable.nullish() });
const SavedTracksResponse = z.object({
  items: z.array(SavedTrack.nullable()),
  total: z.number().optional(),
});
const BooleanList = z.array(z.boolean());

const PlaylistItem = z.object({
  added_at: z.string().nullish(),
  is_local: z.boolean().optional(),
  // Feb 2026: `track` was renamed `item` (the old name is deprecated but may still be sent).
  item: Playable.nullish(),
  track: Playable.nullish(),
});
const PlaylistItemsResponse = z.object({
  items: z.array(PlaylistItem.nullable()),
  total: z.number().optional(),
});

// Spotify may return `null` entries inside item arrays; drop them.
const page = <T extends z.ZodType>(item: T) =>
  z.object({ items: z.array(item.nullable()), total: z.number().optional() });

const PlaylistSummary = z.object({
  id: z.string(),
  name: z.string(),
  uri: z.string(),
  description: z.string().nullish(),
  owner: z.object({ id: z.string().optional(), display_name: z.string().nullish() }).optional(),
  public: z.boolean().nullish(),
  collaborative: z.boolean().optional(),
  // Feb 2026: `tracks` was renamed `items` (the old name is deprecated but may still be sent).
  items: z.object({ total: z.number() }).nullish(),
  tracks: z.object({ total: z.number() }).nullish(),
  external_urls: Urls,
});

const PlaylistsResponse = z.object({
  items: z.array(PlaylistSummary.nullable()),
  total: z.number().optional(),
});

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

const DevicesResponse = z.object({
  devices: z.array(
    z.object({
      id: z.string().nullish(),
      name: z.string(),
      type: z.string().optional(),
      is_active: z.boolean().optional(),
      is_restricted: z.boolean().optional(),
      volume_percent: z.number().nullish(),
    }),
  ),
});

export type SearchResults = {
  tracks?: z.infer<typeof Track>[];
  albums?: z.infer<typeof Album>[];
  artists?: z.infer<typeof Artist>[];
  playlists?: z.infer<typeof Playlist>[];
};
export type PlaylistSummaryData = z.infer<typeof PlaylistSummary>;
export interface Paged<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}
export interface SavedTrackData {
  addedAt: string | null;
  track: z.infer<typeof Playable>;
}
export interface PlaylistItemData {
  position: number;
  addedAt: string | null;
  isLocal: boolean;
  playable: z.infer<typeof Playable>;
}
export type PlayerStateData = z.infer<typeof PlayerState>;
export type DeviceData = z.infer<typeof DevicesResponse>["devices"][number];

const compact = <T>(items: (T | null)[]): T[] => items.filter((i): i is T => i !== null);

interface RequestOptions {
  query?: Record<string, string | number | undefined>;
  body?: unknown;
  /** Scopes this call needs beyond the read-only base; checked against the stored login first. */
  scopes?: readonly string[];
}

export class SpotifyClient {
  private readonly tokens: TokenProvider;
  private readonly fetchFn: FetchLike;
  private readonly baseUrl: string;
  private readonly transferSettleMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(args: {
    tokens: TokenProvider;
    fetch?: FetchLike;
    baseUrl?: string;
    /** Pause between a transfer and the following play (Spotify needs a moment to register the device). */
    transferSettleMs?: number;
    sleep?: (ms: number) => Promise<void>;
  }) {
    this.transferSettleMs = args.transferSettleMs ?? 800;
    this.sleep = args.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
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

  /** The current user's playlists (owned, followed and collaborative). */
  async getPlaylists(
    args: { limit?: number; offset?: number } = {},
  ): Promise<Paged<PlaylistSummaryData>> {
    const { limit, offset } = checkPage(args);
    const raw = await this.request("GET", "/me/playlists", {
      scopes: [SCOPE.playlistReadPrivate, SCOPE.playlistReadCollaborative],
      query: { limit, offset },
    });
    const parsed = PlaylistsResponse.safeParse(raw);
    if (!parsed.success) throw unexpected("playlists");
    const items = compact(parsed.data.items);
    return { items, total: parsed.data.total ?? offset + items.length, limit, offset };
  }

  /**
   * Items of a playlist. Since Feb 2026 Spotify only returns them for playlists the
   * user owns or collaborates on. Entries whose content is gone are skipped
   * (`skipped` counts them); `position` is the item's index in the playlist.
   */
  async getPlaylistItems(args: {
    playlistId: string;
    limit?: number;
    offset?: number;
  }): Promise<Paged<PlaylistItemData> & { skipped: number }> {
    const { limit, offset } = checkPage(args);
    const id = parsePlaylistId(args.playlistId);
    let raw: unknown;
    try {
      raw = await this.request("GET", `/playlists/${id}/items`, {
        scopes: [SCOPE.playlistReadPrivate],
        query: { limit, offset, additional_types: "track,episode" },
      });
    } catch (error) {
      if (error instanceof SpotifyApiError && error.status === 403) {
        throw new SpotifyApiError(
          403,
          "Spotify refused to return this playlist's items (403). Since Feb 2026 the items are only available for playlists you own or collaborate on (not for followed or Spotify-made playlists). Also check that your login includes playlist-read-private (`login --mode library`).",
          { reason: error.reason },
        );
      }
      throw error;
    }
    const parsed = PlaylistItemsResponse.safeParse(raw);
    if (!parsed.success) throw unexpected("playlist items");
    const items: PlaylistItemData[] = [];
    let skipped = 0;
    parsed.data.items.forEach((entry, index) => {
      const playable = entry?.item ?? entry?.track;
      if (!entry || !playable) {
        skipped += 1;
        return;
      }
      items.push({
        position: offset + index,
        addedAt: entry.added_at ?? null,
        isLocal: entry.is_local ?? false,
        playable,
      });
    });
    return {
      items,
      skipped,
      total: parsed.data.total ?? offset + parsed.data.items.length,
      limit,
      offset,
    };
  }

  /** The user's saved ("liked") tracks, newest first. */
  async getSavedTracks(
    args: { limit?: number; offset?: number } = {},
  ): Promise<Paged<SavedTrackData>> {
    const { limit, offset } = checkPage(args);
    const raw = await this.request("GET", "/me/tracks", {
      scopes: [SCOPE.libraryRead],
      query: { limit, offset },
    });
    const parsed = SavedTracksResponse.safeParse(raw);
    if (!parsed.success) throw unexpected("saved tracks");
    const items: SavedTrackData[] = [];
    for (const entry of parsed.data.items) {
      if (entry?.track) items.push({ addedAt: entry.added_at ?? null, track: entry.track });
    }
    return { items, total: parsed.data.total ?? offset + items.length, limit, offset };
  }

  /** Saves tracks to the library (`PUT /me/library`, 1-40 per call; ids/URIs/links accepted). */
  async saveTracks(tracks: readonly string[]): Promise<string[]> {
    const uris = checkLibraryBatch(tracks);
    await this.request("PUT", "/me/library", {
      scopes: [SCOPE.libraryModify],
      query: { uris: uris.join(",") },
    });
    return uris;
  }

  /** Removes tracks from the library (`DELETE /me/library`, 1-40 per call). */
  async removeSavedTracks(tracks: readonly string[]): Promise<string[]> {
    const uris = checkLibraryBatch(tracks);
    await this.request("DELETE", "/me/library", {
      scopes: [SCOPE.libraryModify],
      query: { uris: uris.join(",") },
    });
    return uris;
  }

  /** Which of the tracks are saved (`GET /me/library/contains`, same order as the input). */
  async checkSavedTracks(tracks: readonly string[]): Promise<{ uri: string; saved: boolean }[]> {
    const uris = checkLibraryBatch(tracks);
    const raw = await this.request("GET", "/me/library/contains", {
      scopes: [SCOPE.libraryRead],
      query: { uris: uris.join(",") },
    });
    const parsed = BooleanList.safeParse(raw);
    if (!parsed.success || parsed.data.length !== uris.length) throw unexpected("library contains");
    return uris.map((uri, i) => ({ uri, saved: parsed.data[i] ?? false }));
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

  /**
   * Track/episode URIs go in `uris`; album/artist/playlist/show URIs go in `context_uri`.
   * `offset` is only meaningful for album/playlist contexts (Spotify ignores or rejects it otherwise),
   * so it is refused locally for anything else.
   * `transferFirst` wakes the device with PUT /me/player (no autoplay), waits briefly, then plays.
   */
  async play(
    args: {
      uri?: string;
      deviceId?: string;
      offset?: { position: number } | { uri: string };
      positionMs?: number;
      transferFirst?: boolean;
    } = {},
  ): Promise<void> {
    const kind = args.uri === undefined ? undefined : /^spotify:([a-z]+):/.exec(args.uri)?.[1];
    if (args.offset !== undefined && kind !== "album" && kind !== "playlist") {
      throw new SonoraError(
        "config",
        "`offset` only works together with an album or playlist `uri` (it picks the starting track inside that context).",
      );
    }
    if (args.transferFirst === true) {
      if (args.deviceId === undefined) {
        throw new SonoraError(
          "config",
          "`transfer_first` needs a `device_id` (get it from `list_devices`).",
        );
      }
      await this.transferPlayback({ deviceId: args.deviceId, play: false });
      await this.sleep(this.transferSettleMs);
    }
    let body: Record<string, unknown> | undefined;
    if (args.uri !== undefined) {
      body =
        kind === "track" || kind === "episode" ? { uris: [args.uri] } : { context_uri: args.uri };
    }
    if (args.offset !== undefined) body = { ...body, offset: args.offset };
    if (args.positionMs !== undefined) body = { ...body, position_ms: args.positionMs };
    await this.request("PUT", "/me/player/play", {
      scopes: [SCOPE.modifyPlayback],
      query: { device_id: args.deviceId },
      ...(body !== undefined && { body }),
    });
  }

  /** Devices Spotify currently knows about for this account (active or not). */
  async listDevices(): Promise<DeviceData[]> {
    const raw = await this.request("GET", "/me/player/devices");
    const parsed = DevicesResponse.safeParse(raw);
    if (!parsed.success) throw unexpected("devices");
    return parsed.data.devices;
  }

  /** Moves playback to one device. Spotify accepts exactly one id in `device_ids`. */
  async transferPlayback(args: { deviceId: string; play?: boolean }): Promise<void> {
    await this.request("PUT", "/me/player", {
      scopes: [SCOPE.modifyPlayback],
      body: { device_ids: [args.deviceId], ...(args.play !== undefined && { play: args.play }) },
    });
  }

  async pause(args: { deviceId?: string } = {}): Promise<void> {
    await this.request("PUT", "/me/player/pause", {
      scopes: [SCOPE.modifyPlayback],
      query: { device_id: args.deviceId },
    });
  }

  private async request(
    method: "GET" | "PUT" | "POST" | "DELETE",
    path: string,
    options: RequestOptions = {},
  ): Promise<unknown> {
    const url = new URL(this.baseUrl + path);
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }
    const scopeOptions = options.scopes !== undefined ? { scopes: options.scopes } : {};
    let response = await this.send(
      method,
      url,
      options.body,
      await this.tokens.getAccessToken(scopeOptions),
    );
    if (response.status === 401) {
      // Token may have been revoked/expired early: refresh once and retry.
      response = await this.send(
        method,
        url,
        options.body,
        await this.tokens.getAccessToken({ ...scopeOptions, forceRefresh: true }),
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

/** Library endpoints take 1-40 URIs per call; returns them normalised and de-duplicated. */
export const LIBRARY_MAX_URIS = 40;
function checkLibraryBatch(tracks: readonly string[]): string[] {
  const uris = [...new Set(tracks.map(toTrackUri))];
  if (uris.length < 1 || uris.length > LIBRARY_MAX_URIS) {
    throw new SonoraError("config", `Pass between 1 and ${LIBRARY_MAX_URIS} tracks per call.`);
  }
  return uris;
}

/** Validates paging locally (clear message instead of Spotify's bare 400). */
function checkPage(args: { limit?: number; offset?: number }): { limit: number; offset: number } {
  const limit = args.limit ?? PAGE_DEFAULT_LIMIT;
  const offset = args.offset ?? 0;
  if (!Number.isInteger(limit) || limit < 1 || limit > PAGE_MAX_LIMIT) {
    throw new SonoraError("config", `limit must be an integer between 1 and ${PAGE_MAX_LIMIT}.`);
  }
  if (!Number.isInteger(offset) || offset < 0) {
    throw new SonoraError("config", "offset must be an integer >= 0.");
  }
  return { limit, offset };
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
