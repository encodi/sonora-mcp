# Workflow

How we plan, build and ship Sonora MCP. Lightweight Scrum/Kanban hybrid: one-week sprints, a small
prioritised backlog, trunk-based development with short-lived branches.

## Cadence: 1-week sprints

Sprints run **Monday → Sunday**. Each sprint is a GitHub **milestone** (`Sprint N – <theme>`); the
`v0.1.0` milestone tracks release work that spans sprints.

| Ceremony           | When             | Time-box | Output                                                           |
| ------------------ | ---------------- | -------- | ---------------------------------------------------------------- |
| Backlog refinement | Thursday (prev.) | 30 min   | Next sprint's issues meet the Definition of Ready; `ready` set   |
| Sprint planning    | Monday           | 45 min   | Sprint goal, issues moved into the milestone, capacity check     |
| Daily sync (async) | Daily            | 5 min    | One comment/status line per active issue (done / next / blocked) |
| Sprint review      | Sunday           | 30 min   | Demo of merged work against the sprint goal; update roadmap      |
| Retrospective      | Sunday           | 20 min   | 1–3 improvement actions recorded as `type:task` issues           |

Solo/async variant: ceremonies are written down (milestone description + a retro comment on the closing issue).

## Definition of Ready (DoR)

An issue may enter a sprint (label `ready`) only if:

- [ ] It has a clear user story or goal and a **testable list of acceptance criteria**.
- [ ] Required Spotify endpoints and **scopes** are identified, and availability for Development Mode apps is checked.
- [ ] Security impact is considered (new scope? new write capability? new storage?).
- [ ] It is small enough to finish within the sprint (otherwise split it).
- [ ] It has `type:*`, `priority:*` and `area:*` labels and a milestone.
- [ ] Dependencies/blockers are linked.

## Definition of Done (DoD)

A PR/issue is done only when **all** are true:

- [ ] Acceptance criteria are met and demonstrated.
- [ ] CI is green: `format:check`, `lint`, `typecheck`, `test`, `build` on Node 24.
- [ ] Unit tests cover new behaviour and error paths; Spotify is mocked (no real network in tests).
- [ ] No secrets, tokens or Client IDs anywhere (code, tests, fixtures, logs, docs).
- [ ] Minimal scopes; write tools only in the opt-in mode; no new network hosts.
- [ ] Docs updated (README, `docs/`, tool descriptions) and roadmap adjusted if scope changed.
- [ ] Reviewed by a CODEOWNER (self-review with the PR checklist for solo work) and squash-merged.
- [ ] The linked issue is closed by the PR (`Closes #n`).

## Branches

Trunk-based: `main` is always releasable and protected (CI required, no force-push, no direct pushes after
the bootstrap commit). Branch names: `<type>/<short-kebab-topic>`, optionally with the issue number.

| Prefix      | Use                   | Example                  |
| ----------- | --------------------- | ------------------------ |
| `feat/`     | New capability        | `feat/12-queue-tools`    |
| `fix/`      | Bug fix               | `fix/token-refresh-race` |
| `docs/`     | Documentation only    | `docs/readme-setup`      |
| `chore/`    | Tooling, deps, config | `chore/bump-vitest`      |
| `test/`     | Tests only            | `test/state-validation`  |
| `ci/`       | Workflows             | `ci/add-release-job`     |
| `refactor/` | No behaviour change   | `refactor/client-errors` |

Keep branches short-lived (≤ 2–3 days) and rebase on `main` before merging.

## Commits (Conventional Commits)

`<type>(<optional scope>): <imperative summary>` — ≤ 72 chars, body explains _why_.

Types: `feat`, `fix`, `docs`, `test`, `refactor`, `perf`, `build`, `ci`, `chore`, `revert`.
Breaking changes: `feat!:` or a `BREAKING CHANGE:` footer. Scopes: `auth`, `storage`, `client`, `search`,
`playback`, `cli`, `ci`, `docs`, `deps`.

Examples: `feat(auth): add PKCE login command`, `fix(storage): chmod 0600 after atomic rename`.

PRs are **squash-merged**; the PR title must be a valid Conventional Commit and is used for the changelog.

## Issues and labels

- Types: `type:bug`, `type:feature`, `type:task`, `type:docs`, `type:security`.
- Priority: `priority:p0` (drop everything / security), `p1` (sprint-critical), `p2` (normal), `p3` (nice to have).
- Area: `area:auth`, `area:tools`, `area:api-client`, `area:storage`, `area:cli`, `area:ci`, `area:docs`, `area:security`.
- State helpers: `ready` (meets DoR), `blocked`, `good first issue`, `help wanted`.

Every issue has acceptance criteria as a checklist and exactly one milestone.

## Board

Until a GitHub Project is set up, the board is **milestones + labels** (see [BOARD.md](BOARD.md)).

## Releases

SemVer. Release PR bumps `package.json` and `CHANGELOG.md`; tag `vX.Y.Z` on `main`. Security fixes are
released as patch versions and announced via a GitHub Security Advisory.
