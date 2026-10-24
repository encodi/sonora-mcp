# Sonora MCP

[![CI](https://github.com/encodi/sonora-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/encodi/sonora-mcp/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

A small, security-first **[Model Context Protocol](https://modelcontextprotocol.io) server for Spotify**.
Ask your AI assistant what is playing, search the catalogue and (optionally) play or pause music.

> Español: [README.es.md](README.es.md)

- **OAuth Authorization Code + PKCE, no Client Secret.** Nothing sensitive to leak from the repo or your MCP config.
- **Least privilege.** Default `read-only` mode requests two read scopes. Write tools are _not registered at all_ unless you opt into `playback` mode.
- **Tokens stay on your machine, outside any repo**: `~/.config/sonora-mcp/` (dir `0700`, file `0600`, atomic writes, automatic refresh).
- **No telemetry.** The only hosts contacted are `accounts.spotify.com` and `api.spotify.com`.
- **Built for Spotify's 2026 API**: search `limit` ≤ 10, Development Mode aware error messages.
- TypeScript (strict, ESM), official `@modelcontextprotocol/sdk`, stdio transport, zod-validated inputs, mocked-HTTP test suite.

## Status

Sprint 1 is implemented (see [Roadmap](#roadmap)). Not yet published to npm: install from source.

## Tools

| Tool                | Mode                   | Description                                                                                |
| ------------------- | ---------------------- | ------------------------------------------------------------------------------------------ |
| `search`            | all                    | Search tracks, albums, artists, playlists (`types` array, `limit` 1–10, `offset` paging)   |
| `now_playing`       | all                    | Current track/episode, progress and device                                                 |
| `play`              | `playback`             | Start/resume playback: Spotify URI, `offset`, `position_ms`, `device_id`, `transfer_first` |
| `pause`             | `playback`             | Pause playback                                                                             |
| `list_devices`      | all                    | List Spotify Connect devices (id, name, type, active)                                      |
| `transfer_playback` | `playback`             | Move playback to a device (`device_id` from `list_devices`, optional `play`)               |
| `get_playlists`     | `library`, `playlists` | List the user's playlists (paged, limit ≤ 50)                                              |

## Modes and scopes

Modes are **additive** and can be combined with commas, for example `--mode library,playback`.
Design and trade-offs: [ADR 0001](docs/adr/0001-modes-and-scopes.md).

| Mode (default first) | Scopes added on top of the base                                                                                                                  | Tools                                                                       |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| `read-only`          | base: `user-read-playback-state`, `user-read-currently-playing`                                                                                  | `search`, `now_playing`, `list_devices`                                     |
| `library`            | `user-library-read`, `user-library-modify`, `user-read-recently-played`, `user-top-read`, `playlist-read-private`, `playlist-read-collaborative` | + library, recently played, top items, read playlists (see the Tools table) |
| `playlists`          | `playlist-read-private`, `playlist-read-collaborative`, `playlist-modify-private`, `playlist-modify-public`                                      | + create playlists and add items (see the Tools table)                      |
| `playback`           | `user-modify-playback-state`                                                                                                                     | + `play`, `pause`, `transfer_playback`                                      |

Choose with `SONORA_MODE` or `--mode` (applies to both `login` and `serve`). Spotify grants scopes at login,
so **after changing the mode run `sonora-mcp login --mode <modes>` again** (it replaces the stored login) and
restart your MCP client. Your existing `read-only` and `playback` logins keep working unchanged. If the stored
login lacks a scope a tool needs, that tool returns a clear message with the exact `login --mode ...` command;
tools that do not need the scope keep working. Write tools of a mode that is not enabled are not registered at all.

## Requirements

- Node.js **≥ 24**
- A Spotify account. Spotify's **Development Mode** (Feb 2026 rules) requires the _app owner_ to have **Premium**, allows up to 5 authorised users and a single Client ID per developer. Playback control also needs Premium.

## Install (from source)

```bash
git clone https://github.com/encodi/sonora-mcp.git
cd sonora-mcp
npm ci
npm run build
```

## Configure Spotify (step by step)

1. Open the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. **Create app**.
   - _App name_ / _App description_: anything (e.g. "Sonora MCP", "Personal MCP server").
   - _Redirect URIs_: add **exactly** `http://127.0.0.1:8888/callback` and click **Add**.
     Use the IP literal `127.0.0.1`, **not** `localhost` — Spotify only allows HTTP for loopback IPs.
     To use another port, set `SPOTIFY_REDIRECT_PORT` and register `http://127.0.0.1:<port>/callback`.
   - _Which API/SDKs are you planning to use?_ → **Web API**.
   - Accept the terms and **Save**.
3. Open the app → **Settings** and copy the **Client ID**. You do **not** need (and must not use) the Client Secret.
4. In **Settings → User management**, make sure your own Spotify account (name + email) is listed
   (Development Mode only works for allow-listed users).
5. Export the Client ID in the shell where you will log in:

   ```bash
   export SPOTIFY_CLIENT_ID=<your client id>
   ```

## Log in

```bash
# read-only (default)
node dist/index.js login
# or, to enable play/pause
node dist/index.js login --mode playback
# modes combine (library + playlists + playback)
node dist/index.js login --mode library,playlists,playback
```

The command prints an authorization URL (and tries to open your browser; add `--no-open` to skip that).
Approve the request in Spotify; the browser is redirected to `http://127.0.0.1:8888/callback`, the server
validates `state`, exchanges the code with the PKCE verifier and stores the tokens in
`$XDG_CONFIG_HOME/sonora-mcp/tokens.json` (or `~/.config/sonora-mcp/tokens.json`).

Other commands:

```bash
node dist/index.js status   # who/what is stored (never prints tokens)
node dist/index.js logout   # deletes the token file
node dist/index.js --help
```

## Use with an MCP client

Claude Desktop, Cursor, and any stdio MCP client (use absolute paths):

```json
{
  "mcpServers": {
    "sonora": {
      "command": "node",
      "args": ["/absolute/path/to/sonora-mcp/dist/index.js"],
      "env": {
        "SPOTIFY_CLIENT_ID": "<your client id>",
        "SONORA_MODE": "read-only"
      }
    }
  }
}
```

The Client ID is not a secret, but keep it in your local client config, not in a repository.

## Configuration reference

| Variable                | Default      | Description                                                                  |
| ----------------------- | ------------ | ---------------------------------------------------------------------------- |
| `SPOTIFY_CLIENT_ID`     | – (required) | Client ID of your Spotify app                                                |
| `SPOTIFY_REDIRECT_PORT` | `8888`       | Loopback callback port (register the matching redirect URI)                  |
| `SONORA_MODE`           | `read-only`  | `read-only`, `library`, `playlists`, `playback` (comma-separated to combine) |
| `SONORA_LOG_LEVEL`      | `info`       | `error`, `warn`, `info`, `debug` (logs go to **stderr**, redacted)           |
| `XDG_CONFIG_HOME`       | `~/.config`  | Base directory for `sonora-mcp/tokens.json`                                  |

## Troubleshooting

### `play` says ok but the phone (Android) stays silent

Spotify answers `204` as soon as it _accepts_ the command; it does not wait for the device to obey. Mobile
apps that are idle or backgrounded can ignore a remote `play`, while the Web Player and desktop apps usually
do not (investigation in [#34](https://github.com/encodi/sonora-mcp/issues/34)). Things to try, in order:

1. Open the Spotify app on the phone and start any track for a few seconds, then call `play` while it is active.
2. Call `list_devices`, copy the phone's `id`, and call `play` with `device_id` and `transfer_first: true`
   (it transfers playback to the phone without autoplay, waits ~0.8 s, then plays).
3. Or do it by hand: `transfer_playback` with `play: true`, then `play`.
4. Always confirm with `now_playing`: it tells "no active device" apart from "device active, nothing loaded".

`play` only reports that Spotify accepted the command, so a silent device is not an error on our side.

## Security

See [SECURITY.md](SECURITY.md) for the policy and private reporting. In short: PKCE (S256) without a secret,
constant-time `state` check, loopback-only one-shot callback server, tokens `0600` in a `0700` directory outside
the repo, redacted logs, minimal scopes, write tools opt-in, no telemetry, no hosts besides Spotify's.

## Development

```bash
npm ci
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

Contributing: [CONTRIBUTING.md](CONTRIBUTING.md) · Process: [docs/WORKFLOW.md](docs/WORKFLOW.md) ·
Board: [docs/BOARD.md](docs/BOARD.md).

## Roadmap

Tracked in [milestones](https://github.com/encodi/sonora-mcp/milestones) and
[issues](https://github.com/encodi/sonora-mcp/issues).

- **Sprint 1 – Fundamentos**: skeleton, CI, PKCE login/logout, token storage, HTTP client, `search`, `now_playing`, `play`/`pause`, modes. ✅
- **Sprint 2 – Biblioteca y playlists**: playlists and their items, saved tracks, library save/remove, create playlists (new opt-in modes/scopes).
- **Sprint 3 – Cola, dispositivos y robustez**: queue, devices/transfer, skip/seek/volume/shuffle/repeat, rate-limit backoff, error catalogue.
- **v0.1.0**: npm publishing with provenance, changelog, client setup guides, security review.

## License

[MIT](LICENSE) © 2026 Enrique Coronado. Not affiliated with Spotify AB. "Spotify" is a trademark of Spotify AB.
