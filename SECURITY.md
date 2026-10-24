# Security Policy

Sonora MCP handles OAuth tokens for a user's Spotify account, so we take security reports seriously.

## Reporting a vulnerability (private)

**Please do not open a public issue or PR for security problems.**

Use GitHub's private reporting:
<https://github.com/encodi/sonora-mcp/security/advisories/new>
("Security" tab → "Report a vulnerability").

Include: affected version/commit, impact, reproduction steps, and (if possible) a suggested fix.
**Do not include real tokens, authorization codes or your Client ID** in the report.

You can expect an acknowledgement within 5 business days and a status update within 14 days.
We will credit reporters in the release notes unless you prefer to stay anonymous.

## Supported versions

Pre-1.0: only the latest release and `main` receive security fixes.

## Security design (what we guarantee)

- OAuth Authorization Code with PKCE (S256); **no Client Secret** exists anywhere.
- `state` is validated in constant time; mismatching callbacks are ignored.
- The callback server binds to `127.0.0.1` only and is closed right after login.
- Tokens are stored outside the repository (`$XDG_CONFIG_HOME/sonora-mcp/` or `~/.config/sonora-mcp/`),
  directory `0700`, file `0600`, written atomically.
- Minimal scopes; write tools are not even registered in the default `read-only` mode.
- No telemetry. Network access is limited to `accounts.spotify.com` and `api.spotify.com`.
- Tokens, codes and verifiers are redacted from all logs and error messages.

## If you leaked a token

Run `sonora-mcp logout`, revoke the app at <https://www.spotify.com/account/apps/>, and log in again.
