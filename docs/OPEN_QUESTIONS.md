# Open Questions

Decisions waiting on the project owner, collected so work can resume later. Each has a proposed default; anything not overridden can start with the default.

_Last updated: 2026-11-15_

## Repository state

- Branch `claude/sweet-hopper-28hqmt` (dead-code removal, roadmap audit, unified dev overlay, Phase 3 plan) was merged into `main` as PR #558.
- After the organization transfer, update `package.json` (`homepage: https://TiberiousDoom.github.io/voxel-rpg-game`, `author`, `repository.url`) to the new owner, and re-enable GitHub Pages/Actions on the new repo so `.github/workflows/deploy.yml` deploys. `vite.config.js` `base: '/voxel-rpg-game/'` stays correct if the repo name is unchanged.

## Phase 3 — decisions needed

From [`docs/phases/PHASE_3_DETAILED_PLAN.md`](phases/PHASE_3_DETAILED_PLAN.md#decisions-needed).

| # | Question | Proposed default |
|---|----------|------------------|
| 1 | Finish all Phase 2 leftovers first, or only housing, the NPC schedule and the NPC panel? | **Decided: finish all Phase 2 leftovers first** (changed from the default on 2026-11-15). Order: housing → day/night schedule → farming zone → settlement dashboard → building panel → building upgrades (needs a short design pass first). NPC panel, housing and day/night schedule done |
| 2 | Wire in the settlement engine (`SettlementBridge`) before guard/shelter logic? | **Decided: yes — done.** `SettlementTick` now drives `SettlementModule` through `SettlementBridge` |
| 3 | Permanent NPC death? | No — NPCs are knocked down and recover (or leave if hit again while down) |
| 4 | Enemy navigation: full pathfinding or simple steering? | Steering + breaking through walls; A* only if playtests show stuck raids |
| 5 | Can monsters break blocks? | Only player-placed wood/stone defenses, never terrain |
| 6 | Map scope | Rift list in the pause menu now; real map in Phase 5 |
| 7 | Companion's role | Out of Phase 3; consider the companion rescue story as its own short phase (biggest gap vs. the vision) |

## Phase 3 — open questions

| # | Question | Proposed default |
|---|----------|------------------|
| 1 | Can player spells hurt NPCs? | No; area spells skip NPCs |
| 2 | Do goblins that steal from stockpiles drop the loot when killed? | Yes |
| 3 | "Peaceful builder" mode (no raids, no rift resurgence) — Phase 3 or Phase 5? | Undecided |
| 4 | Do guards use up weapon durability? (Tool durability isn't implemented yet.) | Undecided |
| 5 | NPC recruitment | Defer to Phase 5 trade caravans |

## Known bugs found while planning

- **Fixed: closed rifts reopened after a reload** — rift state is now saved (schema v7, Phase 3 task 3.0.1).
- **Fixed: the rift anchor was almost never attacked** — the anchor check now uses live positions from `store._enemyPositions`, and reinforcements walk to their anchor while the rift is closing unless the player is closer. The rest of task 3.0.2 (target registry, single damage path, removing the legacy Monster path) is still to do.

## Other follow-ups from the roadmap audit

See [`docs/ROADMAP_AUDIT.md`](ROADMAP_AUDIT.md) for the full list. The largest: the companion story, weather, quests and skill points exist in code but are never activated or have no UI.
