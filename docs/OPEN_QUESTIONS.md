# Open Questions

Decisions waiting on the project owner, collected so work can resume later. Each has a proposed default; anything not overridden can start with the default.

_Last updated: 2026-11-21_

## Decided

All earlier questions are resolved. The decisions live where the work does:

- **Phase 3:** [`PHASE_3_DETAILED_PLAN.md` → Decisions](phases/PHASE_3_DETAILED_PLAN.md#decisions), 1–31. Decisions 13–31 (November 21) add the world and endgame: a finite island of 4–5 territories, three rift tiers around a heart rift, resurgence that cascades from small to large rifts, outposts and patrols, peaceful builder mode in Phase 3, slow guard weapon wear with Blacksmith repair, the freed island or New Game+ after the heart is sealed, a single-landmass island, what New Game+ keeps, where the companion is found, outposts that grow on their own, free travel by rift waystones (roads in Phase 5), separate stockpiles per settlement, and New Game+ on the same island: every rift reopens, settlements stay but are damaged, difficulty stacks each cycle. Reopened rifts move to a new spot in their tier's zone, and corruption wears down player-built blocks.
- **Roadmap:** [`3D_IMPLEMENTATION_PLAN.md` → Roadmap Decisions](3D_IMPLEMENTATION_PLAN.md#roadmap-decisions-november-21-2026): Phase 3 before the companion, an ongoing basics track (saves, settings, audio, accessibility), mobile first-class, multiplayer kept lightly with the unused action middleware removed.

## Still open

Questions that came up while deciding the ones above.

| # | Question | Proposed default | Needed by |
|---|----------|------------------|-----------|
| 1 | Can a reopened rift land inside a settlement or outpost? | Not within a settlement's core (its campfire area), so a settlement is never softlocked; its corruption can still reach the edges | 3.3 |
| 2 | How hard does New Game+ hit the settlements at the start? | No instant damage: blocks inside the new corruption start wearing down (Decision 31), so the player has time to respond | Phase 5 |
| 3 | Is there a limit to New Game+ cycles? | No limit; the per-cycle increases get smaller each time so it stays playable | Phase 5 |
| 4 | How fast does corruption wear down blocks, and does material matter? | Wood breaks in about 2 in-game days, stone in about 5 | 3.4 / 3.5 |
