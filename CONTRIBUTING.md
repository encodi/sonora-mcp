# Contributing to Sonora MCP

Thanks for helping! This project is small and security-sensitive, so the rules are short but firm.
The full team process lives in [docs/WORKFLOW.md](docs/WORKFLOW.md).

## Quick start

```bash
git clone https://github.com/encodi/sonora-mcp.git && cd sonora-mcp
node -v          # >= 24
npm ci
npm run format:check && npm run lint && npm run typecheck && npm test && npm run build
```

Tests never talk to Spotify: every HTTP call is mocked. You do not need a Spotify account to contribute
unless you are doing a manual smoke test (use your own Client ID, never commit it).

## How to contribute

1. Pick an issue labelled `ready` (or open one using a template and wait for triage).
2. Branch from `main`: `feat/<short-topic>`, `fix/<short-topic>`, `docs/…`, `chore/…`, `test/…`.
3. Commit using [Conventional Commits](https://www.conventionalcommits.org): `feat(search): cap limit at 10`.
4. Open a PR using the template; link the issue (`Closes #n`). CI must be green; CODEOWNERS are requested as reviewers automatically.
5. Squash-merge. The PR title becomes the commit message, so it must be a Conventional Commit too.

## Rules of the road

- **Security first**: never log or commit tokens, codes, verifiers or Client IDs. Do not add telemetry or
  hosts other than `accounts.spotify.com` / `api.spotify.com`. Do not add a Client Secret flow.
- **Least privilege**: a new tool declares the minimal scopes; anything that writes must be registered only in a
  non-default mode and documented.
- **Strict TypeScript**, ESM, no `any`. Validate all external input with zod.
- **Tests describe behaviour** (vitest). Cover the error paths, not just the happy path.
- **Spotify API reality**: check the Development Mode restrictions (Feb 2026) before proposing an endpoint.
  Search `limit` is max 10.

## Code style

Prettier + ESLint (strict, type-checked) are enforced in CI: `npm run format` and `npm run lint -- --fix`.

## Code of Conduct and security

By participating you agree to the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately
as described in [SECURITY.md](SECURITY.md).
