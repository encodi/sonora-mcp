# ADR 0001: Modes and scopes for Sprint 2 (library and playlists)

- **Status:** Proposed (needs the maintainer's review before any Sprint 2 feature merges, see #11)
- **Date:** 2026-10-24
- **Issue:** [#11](https://github.com/encodi/sonora-mcp/issues/11)

## Context

Sprint 1 shipped two modes: `read-only` (default, two read scopes) and `playback` (adds
`user-modify-playback-state`). Sprint 2 adds tools that need many more scopes:

| Capability                                | Scopes                                                 |
| ----------------------------------------- | ------------------------------------------------------ |
| Saved tracks: list, check                 | `user-library-read`                                    |
| Saved tracks: save, remove                | `user-library-modify`                                  |
| List the user's playlists and their items | `playlist-read-private`, `playlist-read-collaborative` |
| Create playlists, add items               | `playlist-modify-private`, `playlist-modify-public`    |
| Recently played                           | `user-read-recently-played`                            |
| Top artists / tracks                      | `user-top-read`                                        |

Constraints that shape the decision:

- **Least privilege and opt-in writes** are project principles (README, Security). Write tools must not be
  registered at all unless the user opted in.
- Spotify scopes are granted **at login**. Changing what the server may do therefore always means a new
  `login`; the server cannot ask for more later without a browser round trip.
- Existing users (`read-only`, `playback`) already have stored tokens. They must keep working untouched.
- Spotify's Development Mode (Feb 2026) applies in every option, including: playlist contents are only
  returned for playlists the user owns or collaborates on.

## Options

### A. More modes (additive presets)

Each mode is a named bundle of scopes added to the `read-only` base. Modes combine with commas
(`--mode library,playback`).

- (+) Easy to explain and document; one word per intent.
- (+) Matches the existing `--mode` / `SONORA_MODE` UX and `login --mode` hints.
- (-) Bundles can be coarser than strictly needed (a mode may include a write scope you rarely use).
- (-) Number of modes grows with capabilities (mitigated by composing, not by enumerating combinations).

### B. Per-capability flags (`SONORA_CAPABILITIES=library-read,playlist-write,...`)

The user lists exact capabilities; scopes are derived from them.

- (+) Finest possible least privilege.
- (-) More to learn and to misconfigure (typos, forgotten capabilities, 8+ flags); harder to write a single
  clear "run `login --mode X`" hint.
- (-) Still needs a mapping capability → scopes → tools, which is what option A already is, one level up.

### C. One big mode ("full")

- (+) Simplest.
- (-) Violates least privilege; every user who wants to read their playlists would also grant write access.
  Rejected.

## Decision

**Option A, with composable modes**, and a single source of truth that ties tools to scopes. Capabilities
(option B) stay possible later as an advanced override because the internal model is already per-scope.

Modes (each one adds to the `read-only` base: `user-read-playback-state`, `user-read-currently-playing`):

| Mode        | Adds scopes                                                                                                                                      | Tools unlocked (Sprint 2 plan)                                                       |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| `read-only` | – (default; unchanged)                                                                                                                           | `search`, `now_playing`, `list_devices`                                              |
| `library`   | `user-library-read`, `user-library-modify`, `user-read-recently-played`, `user-top-read`, `playlist-read-private`, `playlist-read-collaborative` | read playlists and items, saved tracks (get/save/remove), recently played, top items |
| `playlists` | `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, `playlist-modify-public`                                      | read playlists and items, `create_playlist`, `add_items_to_playlist`                 |
| `playback`  | `user-modify-playback-state` (unchanged)                                                                                                         | `play`, `pause`, `transfer_playback`                                                 |

Notes on the choices:

- `read-only` and `playback` request **exactly the same scopes as in Sprint 1**, in the same order, so existing
  tokens and consent screens are unchanged.
- `library` includes `user-library-modify` (saving/removing tracks) rather than splitting a separate
  read-only library mode. Trade-off: simpler model, slightly broader consent. A `library-readonly` mode can
  be added later without breaking anything if it is wanted.
- Playlist **writes** exist only in `playlists`; library writes only in `library`; neither is reachable from
  `read-only`.
- `playlist-modify-public` is requested together with `-private` because creating a playlist with either
  visibility needs the matching scope. Tools create **private** playlists unless asked otherwise.

### How `login` computes scopes

`--mode` / `SONORA_MODE` accept one mode or a comma-separated list. The set is normalised (deduplicated,
canonical order, `read-only` implied). Scopes are `read-only` base plus the extras of every selected mode,
deduplicated. `login` prints the modes and the exact scopes before opening the browser.

### How tools are tied to scopes and how re-consent is triggered

- Each tool group declares the scopes it needs. A group is **registered only if the configured modes request
  all of them** (write tools do not exist otherwise; this was already true for `playback`).
- Every Spotify call passes the scopes it needs to the token manager. The token manager compares them with
  the scopes **stored in the token file** and fails _before_ any network call with:
  `The stored login lacks the scope(s): ... Run "sonora-mcp login --mode <your modes>" ...`.
  The hint names the server's configured modes (so combined modes keep their other members).
- The check is per tool, not global: after switching to a mode with new scopes, the tools that do not need
  them (for example `search`) keep working until the user re-logs in.
- **Re-consent is always an explicit, manual `login --mode ...` in a terminal.** The server never opens a
  browser or escalates by itself. A new login replaces the stored token and its scopes.
- Stored tokens keep the same format (`scopes` was already stored), so nothing needs migrating.

## Consequences

- Users who want a new capability set must run `login --mode ...` once and restart their MCP client.
- To downgrade, log in again with a smaller mode (or `logout` and revoke at
  <https://www.spotify.com/account/apps/>). The server never uses more than its configured modes allow, even
  if the stored token has extra scopes.
- Documentation (README mode table, CLI `--help`) must be updated whenever a mode changes; the scope sets
  are covered by unit tests (`test/config.test.ts`) so a change cannot happen silently.
- Each new Sprint 2 tool PR states its scopes and mode, and registers through the same group mechanism.

## Open questions for the maintainer

1. Is bundling `user-library-modify` into `library` acceptable, or should saving/removing tracks be separate?
2. Should `library` also include the playlist read scopes (current proposal), or should those live only in
   `playlists`?
3. Do we want a `full` convenience alias (= all modes), or is `--mode library,playlists,playback` enough?
