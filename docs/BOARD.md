# Project board (design)

GitHub Projects v2 needs the `project` OAuth scope, which the bot account used to bootstrap this repo does
not have. **Until the board exists, planning uses milestones + labels** (every issue has a milestone,
`type:*`, `priority:*`, `area:*`).

## Create it (maintainer, one time)

```bash
gh auth refresh -s project          # run in your own interactive session
gh project create --owner encodi --title "Sonora MCP"
gh project link <number> --owner encodi --repo encodi/sonora-mcp
```

Then in the web UI: add the **Status** single-select field with the columns below, enable the built-in
workflows (_Item added to project → Backlog_, _Item closed → Done_, _Pull request merged → Done_), and
turn on auto-add for `encodi/sonora-mcp` issues and PRs.

## Layout

Board view "Sprint board", grouped by **Status**:

| Column          | Meaning                                               | Entry rule                          | WIP limit |
| --------------- | ----------------------------------------------------- | ----------------------------------- | --------- |
| **Backlog**     | Triaged but not scheduled                             | Issue exists, labels set            | –         |
| **Sprint**      | Committed for the current sprint (milestone = sprint) | Meets Definition of Ready (`ready`) | –         |
| **In progress** | Someone is working on it (branch exists)              | Assigned + branch opened            | 3         |
| **In review**   | PR open, CI running / awaiting review                 | PR linked                           | 3         |
| **Done**        | Merged and closed (meets Definition of Done)          | PR merged, issue closed             | –         |

Extra views:

- **Backlog table**: all items, sorted by `Priority`, grouped by Milestone.
- **Roadmap**: timeline by Milestone (Sprint 1 → Sprint 3 → v0.1.0).
- **Bugs**: filter `label:type:bug`, sorted by priority.

Custom fields: `Priority` (from `priority:*`), `Area` (from `area:*`), `Estimate` (S/M/L).

## Mapping while there is no board

| Board column | Equivalent today                                            |
| ------------ | ----------------------------------------------------------- |
| Backlog      | Open issue without `ready`, or milestone of a future sprint |
| Sprint       | Open issue with `ready` in the current sprint milestone     |
| In progress  | Open issue with a linked branch / assignee                  |
| In review    | Issue with an open linked PR                                |
| Done         | Closed issue                                                |
