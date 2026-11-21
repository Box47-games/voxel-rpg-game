---
name: ship
description: The release loop for Riftholm, from a fresh branch to a merged pull request. Use for any change that will be merged to main (a feature, a fix, a balance change or a docs-only change), and when asked to "release", "ship" or "merge".
---

# Shipping a change

Every merge to `main` is a release: a new version and a `CHANGELOG.md` entry (D-003). `main` deploys the game to
GitHub Pages. `CLAUDE.md` holds the code rules; this is the order to do things in.

## 1. Start from the latest main

Other sessions merge to `main` too, so the version and the last decision number move under you.

```bash
git fetch origin main
git checkout -B <your branch> origin/main
```

## 2. Make the change

- Balance numbers go in `src/data/tuning.js` (never hard-coded); new settlement rules go in the headless engine
  (`src/modules/settlement/`), tested with `fakeWorld.js`, not in the store.
- New behaviour gets a unit test next to the code (`__tests__/`). Gameplay stops while paused.
- If saved state changes, bump the schema in `Game3DSaveManager.js` and add a step to `migrateSave`, with a test.

## 3. Docs, in the same commit

| File | What |
|---|---|
| `CHANGELOG.md` | A new `## X.Y.Z · YYYY-MM-DD · Title` at the top with `### New` and `### Fixed`, written for players. |
| `package.json` | `"version"` matches the new entry (`src/__tests__/changelog.test.js` checks). |
| `package-lock.json` | The same version in **two** places: the top and `packages[""]`. |
| `docs/DECISIONS.md` | A new `D-0xx` row after the last one for any real choice: `# \| Date \| Decision \| Why \| Status`. Never edit old rows; supersede them. |
| `docs/3D_IMPLEMENTATION_PLAN.md`, `docs/phases/` | The roadmap and the phase plan's checkboxes, as they are after the change. |
| `docs/OPEN_QUESTIONS.md` | A question for the owner, with a proposed default. |
| `CLAUDE.md` | A new system, file or gotcha the next agent needs. |

Bump the minor version for features, the patch for fixes and docs. Plain, short sentences.

## 4. Check, then push

```bash
npm run lint
npm test
npm run build && npm run test:smoke
```

The lint has a warning cap: fix warnings and lower it, never raise it. Then push the branch:

```bash
git push -u origin <your branch>
```

## 5. The pull request

- Title: `X.Y.Z: what changed (D-0xx)`. Body: `Closes #n.` for each issue fixed, what changed and why, and how it
  was checked.
- CI's `check` job (lint, tests, build, smoke test) must pass on the head commit; `main` is protected and won't
  take it otherwise. Never skip or loosen a test to get green: find the cause.
- **Merge only when the owner says so**, through the API with the exact head SHA (`git rev-parse HEAD`). Never
  force-push `main`.

## 6. After the merge

- Close any issues the release fixed that didn't close themselves, each with a line naming the version.
- Tell the owner what changed in the game, and any choice they may want changed.
