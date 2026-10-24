# Changelog

All notable changes are documented here. Format: [Keep a Changelog](https://keepachangelog.com),
versioning: [SemVer](https://semver.org).

## [Unreleased]

### Added

- Project skeleton, CI, governance docs.
- PKCE login/logout/status, secure token storage with refresh.
- Tools: `search`, `now_playing`, `play`, `pause` (playback mode only).
- Tools `list_devices` (all modes) and `transfer_playback` (playback mode) (#18).
- `play`: `offset` (album/playlist), `position_ms` and `transfer_first` (wake a device before playing); README troubleshooting for silent Android devices (#34).
- Modes `library` and `playlists`, combinable with commas (`--mode library,playback`); per-tool scope check with a clear `login --mode ...` error; ADR 0001 (#11).
- Tool `get_playlists` (modes `library`, `playlists`): paged list (limit ≤ 50) of the user's playlists in a compact format (#12).
- Tool `get_playlist_items` (modes `library`, `playlists`): paged items of a playlist via `/playlists/{id}/items` (Feb 2026 API), with a clear message for non-owned playlists (#13).

### Fixed

- `search`: `types` is now documented as an array (single string accepted), the singular `type` is an alias, and unknown parameters are rejected instead of silently falling back to tracks (#32).
- `now_playing` now distinguishes "no active device" from "active device with nothing loaded" and names the device in the latter case (#35).
