# Open Questions

Decisions waiting on the project owner, collected so work can resume later. Each has a proposed default; anything not overridden can start with the default.

_Last updated: 2026-11-21_

## Decided

All earlier questions are resolved. The decisions live where the work does:

- **Phase 3:** [`PHASE_3_DETAILED_PLAN.md` → Decisions](phases/PHASE_3_DETAILED_PLAN.md#decisions), 1–36. Decisions 13–36 (November 21) add the world and endgame: a finite island of 4–5 territories, three rift tiers around a heart rift, resurgence that cascades from small to large rifts, outposts and patrols, peaceful builder mode in Phase 3, slow guard weapon wear with Blacksmith repair, the freed island or New Game+ after the heart is sealed, a single-landmass island, what New Game+ keeps, where the companion is found, outposts that grow on their own, free travel by rift waystones (roads in Phase 5), separate stockpiles per settlement, and New Game+ on the same island: every rift reopens, some blocks break at once, and each cycle adds one more difficulty mechanic. Reopened rifts move to a new spot in their tier's zone, possibly inside a settlement, and nothing is protected from them. Corruption wears down player-built blocks by material.
- **Roadmap:** [`3D_IMPLEMENTATION_PLAN.md` → Roadmap Decisions](3D_IMPLEMENTATION_PLAN.md#roadmap-decisions-november-21-2026): Phase 3 before the companion, an ongoing basics track (saves, settings, audio, accessibility), mobile first-class, multiplayer kept lightly with the unused action middleware removed.

## Still open

| # | Question | Proposed default | Needed by |
|---|----------|------------------|-----------|
| 1 | In what order are New Game+ mechanics added? | Stronger monsters → more rifts → earlier raids → faster resurgence → corruption spreads → rift storms; after the pool runs out, repeat with bigger numbers | Phase 5 |
| 2 | What share of blocks breaks at the start of New Game+? | A quarter of the player-built blocks inside the new corruption | Phase 5 |
| 3 | If a rift destroys the main settlement's campfire, what happens to its settlers? | They move to the nearest outpost; with none, they wait by the ruins for a new campfire, then leave after a few days | 3.3 / 3.6 |
