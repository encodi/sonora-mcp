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
