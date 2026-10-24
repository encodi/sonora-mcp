import { SonoraError } from "./errors.js";

const BASE62_ID = /^[A-Za-z0-9]{10,40}$/;

/**
 * Accepts a bare playlist id, a `spotify:playlist:<id>` URI or an
 * `https://open.spotify.com/playlist/<id>` link and returns the id.
 * Anything else is rejected locally so nothing odd is ever put into a request path.
 */
export function parsePlaylistId(input: string): string {
  const value = input.trim();
  const uri = /^spotify:playlist:([A-Za-z0-9]+)$/.exec(value);
  const link =
    /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?playlist\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(
      value,
    );
  const id = uri?.[1] ?? link?.[1] ?? value;
  if (!BASE62_ID.test(id)) {
    throw new SonoraError(
      "config",
      "playlist_id must be a Spotify playlist id, a spotify:playlist:<id> URI or an open.spotify.com playlist link.",
    );
  }
  return id;
}

/**
 * Normalises a track id, `spotify:track:<id>` URI or open.spotify.com track link to a
 * `spotify:track:<id>` URI (what the library endpoints take in `uris`).
 */
export function toTrackUri(input: string): string {
  const value = input.trim();
  const uri = /^spotify:track:([A-Za-z0-9]+)$/.exec(value);
  const link =
    /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?track\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(
      value,
    );
  const id = uri?.[1] ?? link?.[1] ?? value;
  if (!BASE62_ID.test(id)) {
    throw new SonoraError(
      "config",
      `"${value.slice(0, 60)}" is not a Spotify track id, spotify:track:<id> URI or open.spotify.com track link.`,
    );
  }
  return `spotify:track:${id}`;
}

/**
 * Normalises a track/episode id-less reference (`spotify:track|episode:<id>` URI or the matching
 * open.spotify.com link) to a URI. Bare ids are rejected because the type would be ambiguous.
 */
export function toPlayableUri(input: string): string {
  const value = input.trim();
  const uri = /^spotify:(track|episode):([A-Za-z0-9]+)$/.exec(value);
  const link =
    /^https:\/\/open\.spotify\.com\/(?:intl-[a-z]+\/)?(track|episode)\/([A-Za-z0-9]+)(?:[?#].*)?$/.exec(
      value,
    );
  const match = uri ?? link;
  if (!match?.[1] || !match[2] || !BASE62_ID.test(match[2])) {
    throw new SonoraError(
      "config",
      `"${value.slice(0, 60)}" is not a spotify:track:<id> / spotify:episode:<id> URI or an open.spotify.com track/episode link.`,
    );
  }
  return `spotify:${match[1]}:${match[2]}`;
}
