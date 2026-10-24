# Project board

**Board: [Sonora MCP – Roadmap](https://github.com/users/encodi/projects/1)** (GitHub Projects v2, public,
linked to this repository). It holds every issue of the repo; milestones + labels
(`type:*`, `priority:*`, `area:*`) remain the source of truth for triage and are mirrored into the
board fields `Sprint`, `Priority` and `Area`.

## How it was set up

```bash
gh project create --owner encodi --title "Sonora MCP – Roadmap"
gh project link 1 --owner encodi --repo encodi/sonora-mcp
gh project edit 1 --owner encodi --visibility PUBLIC
```

The **Status** options, the extra fields and the views were configured through the GraphQL API
(`updateProjectV2Field`, `createProjectV2View`). Still to do in the web UI (not exposed by the API):
enable the built-in workflows (_Item added to project → Backlog_, _Item closed → Done_,
_Pull request merged → Done_) and auto-add for `encodi/sonora-mcp` issues and PRs.

## Layout

Board view "Sprint board", grouped by **Status** (done):

| Column          | Meaning                                               | Entry rule                          | WIP limit |
| --------------- | ----------------------------------------------------- | ----------------------------------- | --------- |
| **Backlog**     | Triaged but not scheduled                             | Issue exists, labels set            | –         |
| **Sprint**      | Committed for the current sprint (milestone = sprint) | Meets Definition of Ready (`ready`) | –         |
| **In progress** | Someone is working on it (branch exists)              | Assigned + branch opened            | 3         |
| **In review**   | PR open, CI running / awaiting review                 | PR linked                           | 3         |
| **Done**        | Merged and closed (meets Definition of Done)          | PR merged, issue closed             | –         |

Other views:

- **Backlog table**: all items as a table.
- **Roadmap**: timeline view (the API cannot set its date fields; configure them in the UI if needed).
- **Bugs**: filter `label:"type:bug"`.

Custom fields: `Sprint` (milestone mirror), `Priority` (P0–P3, from `priority:*`) and `Area` (from the first
`area:*` label). Grouping and sorting of the table views are not exposed by the API; set them in the UI.

## Mapping to labels and milestones

| Board column | Equivalent label / milestone                                |
| ------------ | ----------------------------------------------------------- |
| Backlog      | Open issue without `ready`, or milestone of a future sprint |
| Sprint       | Open issue with `ready` in the current sprint milestone     |
| In progress  | Open issue with a linked branch / assignee                  |
| In review    | Issue with an open linked PR                                |
| Done         | Closed issue                                                |
