## What and why

<!-- One or two sentences. Link the issue: "Closes #123". -->

## How to test

<!-- Commands or steps. Never paste tokens, Client IDs of other people or personal Spotify data. -->

## Checklist (Definition of Done)

- [ ] Linked to an issue with acceptance criteria and a milestone
- [ ] `npm run format:check && npm run lint && npm run typecheck && npm test && npm run build` pass locally
- [ ] Tests added/updated (behaviour, not implementation); Spotify is always mocked
- [ ] No secrets, tokens or Client IDs in code, tests, logs or screenshots
- [ ] New/changed behaviour is documented (README / docs)
- [ ] Commits follow Conventional Commits; PR title does too
- [ ] Security impact considered (scopes, token handling, new network hosts: only accounts.spotify.com and api.spotify.com are allowed)
