# Roadmap & Vision Audit

**Date:** November 11, 2026 (Phase 2 and Phase 3 sections updated November 15, 2026; open-issue coverage added November 21, 2026)
**Compared:** the live game code (everything reachable from `src/index.jsx`) against
- `docs/3D_IMPLEMENTATION_PLAN.md` (phases 0–7)
- `docs/phases/PHASE_0/1/2_DETAILED_PLAN.md` (exit criteria)
- `documentation/archive-code/2d-prototype/docs/VISION.md` (pillars, design principles, companion arc, NPC philosophy — the 3D plan says it is "Based on VISION.md and ROADMAP.md")

**Method:** each criterion was checked by reading the code that implements it, not by trusting comments or commit messages. Performance targets were not measured (no representative GPU in this environment) and are marked *unmeasured*.

Legend: ✅ done · 🟡 partial · ❌ missing · 🔌 code existed but was never connected to the game

---

## Summary

The game is a solid **Phase 1** (survival loop) with a **working core of Phase 2** (immigration, zones, mining, hauling, construction) and a **useful slice of Phase 3** (rifts that can be closed, corruption, dodge/block/melee/spells). Phase 4 (the companion) — the vision's emotional core — is **not playable**: the companion is never activated, dialogue never opens and spells are never taught.

Three patterns explain most gaps:

1. **Built but never connected.** Several features were written, tested and merged but never mounted or imported by the game, so players never see them. The biggest were the companion story (Phase 4), quests UI, skill-tree UI, town upgrades, game modes and the "endgame" systems from PR #556. These were all dead code and were removed in the dead-code cleanup; they can be restored from the commits listed in [Built but never connected](#built-but-never-connected) if you want to wire them up.
2. **Constants without behavior.** `tuning.js` defines numbers for features that don't exist yet (tool durability, shelter health/stamina regen, shelter monster exclusion). They read as done but do nothing.
3. **The docs describe a different game.** `README.md` describes the old 2D settlement game, and `PHASE_2_DETAILED_PLAN.md` §2.0 wires the settlement through `GameManager`/`ModuleOrchestrator`, which the 3D app never used (and which no longer exist). The newer `.claude/plans/phase2-settlement-unification.md` already supersedes it.

---

## Open issues vs. the roadmap (November 21, 2026)

The 22 open issues checked against the phases above and against the code on `main`.

### What the issues cover

| Phase | Issues | Coverage |
|---|---|---|
| 0 Foundation | #585 action system, #586 save on a worker, #587 object pooling, #588 multiplayer-ready state | All four ❌ exit criteria have an issue. #586's premise is wrong (see gaps). |
| 2 Settlement | #583 building effects (Storage Shed, Watchtower, Blacksmith) | Storage/production effects covered. BUILDING zone and dashboard production rates have no issue. |
| 3 Combat & Portals | #576 tracker, #577 targets + one damage path, #578 per-enemy cost; player feedback #570, #571, #573, #574 | Good. 3.1–3.9 live as checkboxes in #576 only. |
| 4 Companion | #579 | Covered, but there is no `PHASE_4_DETAILED_PLAN.md`, which the 3D plan asks for before starting. |
| 5 Polish | #580 skill tree, #581 quest log, #582 weather | Covered for those three. Audio, accessibility, settings and the map have none. |
| 6 Multiplayer | #588 (prep only) | Expected; the phase hasn't started. |
| 7 Release | none | See gaps. |
| Player bugs | #567 main menu, #568 pickup labels, #569 diagonal speed, #572 wildlife count, #575 feedback day | Small, independent fixes. #567 and #575 are confirmed still present in code. |
| Tooling | #584 ESLint 10 | Fine. |

### Gaps found (issues opened November 21)

Ordered by how much they hurt a player today.

1. **No autosave** (#589). `Game3DSaveManager.startAutoSave` has no callers, and nothing saves on `pagehide`/`visibilitychange`. The only saves are the pause menu's Save and the dev overlay. Closing the tab, a crash or a phone killing the page loses everything since the last manual save. #586 assumes autosaves exist; it should follow this fix. If autosave writes to the `autosave` slot, the start screen's Continue (which loads `default`) also has to pick the newest slot.
2. **Audio is placeholder** (#590). `utils/AudioManager.js` holds 18 inline data-URI beeps, many named for the 2D game (`dungeonEnter`, `bossPhaseChange`). Only 4 calls exist in live code (melee swing, loot pickup, enemy death, and `play('error')` for a sound that doesn't exist, so it is silent). No music, no ambience, no footsteps, mining, building or spell sounds, and no volume control. The 3D plan lists audio as a Phase 5 goal; Phase 3 §3.8 also lists combat audio.
3. **No settings / accessibility screen** (#591). There's nowhere to set volume, text or UI size, a colour-blind palette, key remapping, mouse sensitivity or graphics quality (render distance, shadows). Phase 5 lists accessibility options, and Phase 1's "colour-blind safe, 375 px readable" was never verified.
4. **Quests never exist at runtime** (#592). `useQuestStore.initializeAllQuests` has no callers, so `QuestManager` has nothing to track. #581 asks for the UI and for saving progress, but not for this; the log would be empty.
5. **No Phase 4 / Phase 5 detailed plans** (#593). `docs/phases/` stops at Phase 3. #579 points to a restorable `CompanionStoryManager` (commit `c34db28`) but has no design for the rescue, bond milestones or which spells get taught.
6. **Settlers lack the "Grow" pillar's social side** (#594). No relationships between settlers, no specialists/merchants, no recruitment (OPEN_QUESTIONS defers recruitment to Phase 5 trade caravans). 
7. **Monster count is short of the plan** (#595). 4 rift monster types (slime, goblin, skeleton, shadow creeper) against the plan's "5+". §3.2 in #576 covers behaviour variety but not new types.
8. **Release basics** (#596). The PWA manifest exists but there's no service worker (no offline play or install-update flow). There's no itch.io/desktop build plan (Phase 7), and `README.md` still shows "production ready" and "v1.0" badges and 2D-era content.
9. **Performance targets still unmeasured** (#597). #578 covers per-enemy cost only. Nobody has measured the Phase 0 targets (60 FPS, <1 GB memory, <100 ms per chunk) on real hardware, and there's no coverage tooling to back the ">70% coverage" criterion.
10. ~~**Undecided Phase 3 questions** (#598).~~ Decided November 21 (Phase 3 plan, Decisions 13–21); the long-term goal and endgame are now in `3D_IMPLEMENTATION_PLAN.md` → Roadmap Decisions.

### Docs that are out of date

- This file: the summary and "Recommended next steps" predate tool durability, shelter perks, pathfinding, block pieces and the art pass (items 3 and 7 are done or partly done).
- `docs/OPEN_QUESTIONS.md`: last updated 2026-11-15; decision 4 superseded.
- `docs/3D_IMPLEMENTATION_PLAN.md` "Current State" and `README.md`, as listed under Documentation drift.

---

## Vision pillars scorecard

| # | Pillar | Promise | State | Notes |
|---|--------|---------|-------|-------|
| 1 | **Build** | Wilderness → fortified village, block by block | 🟡 | Free-form block building works (now costs materials). Blueprint construction by NPCs works. No progression of building tiers, no fortifications/defensive structures, no building upgrades. |
| 2 | **Grow** | NPCs with personalities who live, work, fight with you | 🟡 | Immigration, identities, personalities, needs, mining/hauling/building all work. Missing: relationships, day/night schedule, housing assignment, NPC guards, merchants, specialists. |
| 3 | **Reclaim** | Close portals, clear monsters, take back the world | 🟡 | Rifts spawn monsters, corrupt land, can be closed (corruption fades, reinforcements escalate). Missing: territory control, portal resurgence after closing, raids on the settlement. |
| 4 | **Choose** | Story optional, sandbox always there | 🟡 | Sandbox is always there. There is no story content to opt into (companion/quests not playable). |
| 5 | **Connect** | Solo with companion, or with friends | ❌ | Companion inactive; no multiplayer layer (Phase 6, expected). |

### Design principles

| Principle | State | Evidence |
|-----------|-------|----------|
| NPCs helpful, never a chore | ✅ | NPCs pick tasks themselves (`systems/settlement/TaskAssignmentEngine.js`, `SettlementTick.jsx` work scan every `WORK_SCAN_INTERVAL`). |
| Player is a participant | ✅ | Player mines, builds, fights and delivers materials alongside NPCs (`ConstructionPanel`, `deliverToConstruction`). |
| Progression feels earned | 🟡 | XP/levels, attribute & skill points accrue (`CharacterSystem.js`) but there is **no UI to spend skill points** (skill-tree UI was never mounted). Tool tiers gate ores. No settlement tier progression. |
| World feels alive | 🟡 | Day/night lighting, wildlife, rifts and NPC needs are live. **Weather never shows**: `WeatherEffects.jsx` reads `store.weather`, which nothing ever sets. No seasons. |
| Complexity is discoverable | ✅ | `ContextualHints.jsx`, `MobileTouchTutorial.jsx`, `KeyboardShortcutsPanel.jsx`. |

### Companion arc (VISION "The Companion Arc", Plan Phase 4)

| Item | State | Evidence |
|------|-------|----------|
| Rescue at game start | ❌ | Nothing sets `companion.active = true` (`setCompanionState` has no callers). `ContextualHints` even shows a "You sense someone nearby…" hint that leads nowhere. |
| Companion follows/renders | 🔌 | `Companion.jsx` and `CompanionController.jsx` are mounted but early-return while inactive. |
| Dialogue | 🔌 | `DialogueUI.jsx` + `systems/story/DialogueEngine.js` work, but `openDialogue` has no callers. |
| Teaches magic at bond milestones | ❌ | `unlockSpell` has no callers; players start with 6 spells and never gain more. |
| Story manager & dialogue content | 🔌 | `CompanionStoryManager.js` + `companion-dialogue.json` (commit `c34db28`) were never imported — removed as dead code. |

---

## Phase-by-phase

### Phase 0 — Foundation

| Exit criterion | State | Evidence / gap |
|---|---|---|
| Infinite world | ✅ | `ChunkManager` + seeded `chunkWorker.js` generation. |
| Chunk loading / unloading, memory freed | ✅ | `ChunkManager.updateChunkQueues`, `unloadChunk` disposes meshes. |
| LOD for distant chunks | ✅ | `LODGenerator.js`, `ChunkRenderer.jsx` `selectLODLevel`. |
| Break / place blocks with mouse | ✅ | `BlockInteraction.jsx` (desktop + long-press mobile). |
| WASD, jump, mouse look | ✅ | `useKeyboard.js`, `FirstPersonControls.jsx`, `CameraRotateControls.jsx`. |
| Inventory (I key) | ✅ | `InventoryUI.jsx`. |
| Save/Load with all state | ✅ | `Game3DSaveManager.js` (v8; includes unloaded modified chunks). **No autosave runs** (see below). Quests: only completed IDs saved. |
| **All mutations go through action system** | ❌ | `systems/state/ActionSystem.js` middleware is installed but **nothing dispatches actions** — every mutation is a plain `set()`. |
| Save in a worker, non-blocking | ❌ | Save runs on the main thread (IndexedDB is async, serialization is not). |
| **Multiplayer-ready state** | ❌ | No authority/input layer. The `NetworkLayer` that existed was never used and was removed as dead code. |
| **Object pooling** | ❌ | No pools in live code (`systems/pools/PoolManager.js` existed but was never imported). Projectiles/particles/damage numbers allocate per spawn. |
| 60 FPS, <16 ms frame, <1 GB memory, <100 ms/chunk | *unmeasured* | The per-frame re-render fixes in PR #557 removed the largest known main-thread cost. Use the dev overlay's perf tab to measure. |
| Test coverage >70% for new systems | 🟡 | 111 test files (Nov 21); coverage tooling isn't installed so % is unknown. |

### Phase 1 — Survival & Gathering

| Exit criterion | State | Evidence / gap |
|---|---|---|
| Day/night cycle + dynamic lighting | ✅ | `DayNightCycle.jsx`, `DayNightLighting.js`, `TimeManager.js`. |
| Hunger: drains, food restores, starvation damages | ✅ | `HungerSystem.js`, `SurvivalTick.jsx`, `eatMaterial`. |
| Mining yields items; all blocks drop appropriately | ✅ | `blockDrops.js` + `calculateDrops`. |
| Tool progression wood → stone → iron | 🟡 | Stone/iron/steel pickaxes & axes exist with `harvestSpeed`/`toolTier`. **No wooden tier** recipe (bare hands → stone). Tools must be equipped in the *weapon* slot to count. |
| **Tool durability** | ✅ | Stone 65 / iron 250 / steel 1000 uses; a block costs ceil(hardness) uses; broken tools mine like bare hands until repaired (half the recipe, scaled by wear); death costs 25% (2026-11-16). No wooden tools by design. |
| Rift spawning, visuals, night intensification | ✅ | `RiftManager.js` (night spawn table, night pop cap), `RiftVisual.jsx`, `RiftParticles.jsx`. |
| **Shelter gives tangible benefits** | ✅ | 25% less hunger, 2× health regen (new base 0.5/s, hunger-gated, paused 8 s after damage), 1.5× stamina regen, no rift spawns within 16 units (2026-11-16). |
| Survival HUD incl. tool status | ✅ | Health/mana/stamina/hunger/time/shelter, plus the tool in hand and its uses left. |
| Death: lose resources, respawn | ✅ | `respawnPlayer` (50% materials, 50% health/hunger, spawn protection). |
| Mobile: swipe camera, auto-jump, pinch zoom | ✅ | `CameraRotateControls.jsx` (pinch + wheel), auto-jump in `Player.jsx`. |
| Save/load preserves new state | ✅ | Hunger, world time, shelter-relevant world edits saved. |
| Color-blind safe, 375 px readable | *not verified* | |

### Phase 2 — NPCs & Settlement

| Exit criterion | State | Evidence / gap |
|---|---|---|
| Immigration with visible approach | ✅ | `SettlementTick.jsx` §3 (APPROACHING state, attractiveness threshold). |
| NPC identity (name, personality, appearance) | ✅ | `data/npcIdentity.js`, `npcNames.js`. |
| Zone designation: mining, stockpile, **farming, building** | 🟡 | Mining, Stockpile and Farm (2026-11-15: Farm Plot building + farm zone, settlers plant/harvest vegetables, unattended trickle) are offered. No BUILDING zone yet. |
| Autonomous mining | ✅ | `MiningZoneScanner.js` + work loop. |
| Hauling mine → stockpile → construction | ✅ | `WORKING_HAUL` / `haulPhase` in `SettlementTick.jsx`. |
| Stockpiles | ✅ | `zone.storage` with capacity; `StockpilePanel.jsx`. (Map-based, not slot-based as the plan specified.) |
| Blueprint placement + NPC construction | ✅ | `BuildingCatalog`, `BuildingPlacement`, `ConstructionTick`, `ConstructionVisual`. |
| **Building effects** (housing, storage, production, happiness) | 🟡 | Housing done (2026-11-15): `effects.housing` beds set the population cap (`modules/settlement/housing.js`). No storage/production effects. |
| **Building upgrades** | ✅ | Done 2026-11-15: Shelter → House → Manor, grown in place from the same corner (`buildingInfo.getUpgradeProblem` checks settlers, overlap, clear and level ground). Residents keep their beds during the upgrade; it can be cancelled until blocks start being replaced. |
| NPC needs (eat, rest, social) interrupting work | ✅ | EATING/SLEEPING states, needs decay, happiness, unhappy-departure warnings. |
| **Daily schedule (work/eat/sleep by time of day)** | ✅ | Done 2026-11-15 (`modules/settlement/schedule.js`): work shifts, mealtimes, evening socializing, sleep at home at night; diligent/lazy shift work hours. No emergency override yet (nothing to respond to until Phase 3 raids). |
| **Housing assignment, sleep at home** | ✅ | Done 2026-11-15: settlers get a bed in completed Shelters/Houses, sleep on their home's doorstep (they can't path inside), homeless ones sleep by the campfire with a happiness penalty. No manual reassignment or housing preferences yet. |
| **Settlement dashboard** | ✅ | Done 2026-11-15: N key / HUD button. Population (sortable settler list → NPC panel), stockpile resources, buildings, alerts. No production/consumption rates yet. |
| **NPC detail panel** (click an NPC) | ✅ | Done 2026-11-14: E next to a settler opens `NPCPanel.jsx` (needs, job, home, personality); also opened from the dashboard and building panel. |
| **Building panel** (status, occupants, upgrades) | ✅ | Done 2026-11-15: E on a completed building shows its effects, residents (click → NPC panel), farms a plot powers, its upgrade (cost, settlers, benefits, what blocks it), and Demolish (confirm, 50% refund); construction sites show builder and ETA. No health/repair (no damage yet), no worker assignment (no production buildings). |
| Settlement loop campfire → arrive → zones → mine → haul → build → grow | ✅ | Works end to end, including growth from building housing. |
| Save/load settlement state | ✅ | NPCs, zones, stockpiles, construction sites. |

**Architecture note:** Phase 2 §2.0 says to register a `SettlementModule` with `ModuleOrchestrator`/`GameManager`. The 3D app never used those (they were removed as dead code). `.claude/plans/phase2-settlement-unification.md` superseded §2.0, and that wiring is done (2026-11-15): `SettlementTick.jsx` is a thin loop that drives `src/modules/settlement/SettlementModule` through `SettlementBridge`, with the module published as `useGameStore._settlementModule`.

**Phase 2 is done** (2026-11-15). Remaining gaps above (BUILDING zone, storage/production building effects, production rates on the dashboard) are optional polish, not Phase 3 blockers.

### Phase 3 — Combat & Portals ([detailed plan](phases/PHASE_3_DETAILED_PLAN.md), decisions resolved 2026-11-15)

| Goal | State | Evidence / gap |
|---|---|---|
| Melee, ranged, dodge, block | ✅ | `meleeAttack.js`, `Projectile.jsx`, dodge/block in `Player.jsx`. |
| Monster variety | 🟡 | 4 rift monster types + elites; behavior is identical "chase and hit" (`Enemy.jsx`). |
| Portal spawn / close / reopen | 🟡 | Spawn + close + corruption fade + escalating reinforcements work; reinforcements attack the anchor and rift state survives save/load (2026-11-14). **No reopening/resurgence** of closed rifts (vision: "Victory is never permanent"). Rifts only go dormant briefly. |
| Territory & corruption | 🟡 | Corruption spreads from rifts (`CorruptionManager.js`); no territory ownership. |
| Defensive structures, NPC guards, raids | ❌ | None. NPCs only flee/work; no raids on the settlement. |

### Phase 4 — Companion & Magic

See [Companion arc](#companion-arc-vision-the-companion-arc-plan-phase-4). Spellcasting itself is ✅ (15 spells; AOE, buffs and status effects now work after PR #557). Learning magic from the companion is ❌.

### Phase 5 — Polish & Content

| Goal | State | Evidence / gap |
|---|---|---|
| Audio | 🟡 | `AudioManager.js` (Howler) plays a handful of SFX; no music or ambience. |
| Weather / particles / lighting | 🟡 | Particles + lighting ✅. Weather ❌ (never set, see above). |
| **Quest system** | 🔌 | `QuestManager` tracks kills/collections, but `initializeAllQuests` is never called (no quests exist at runtime) and there is no quest UI. |
| Tutorial & onboarding | ✅ | Contextual hints + mobile tutorial + key reference. |
| Accessibility options | ❌ | No settings for text size, color-blind palette, key remapping. |

### Phase 6–7 — Multiplayer, Release

Not started (as planned). The PWA manifest is present; the service worker was never registered and was removed.

---

## Built but never connected

These were merged as features but never reachable from the game. They were removed in the dead-code cleanup; restore any of them with `git checkout <commit> -- <path>` if you want to wire them in.

| Feature | Files | Restore from |
|---------|-------|--------------|
| Companion story (rescue, bond milestones, spell teaching, lore) | `src/systems/story/CompanionStoryManager.js`, `src/config/dialogue/companion-dialogue.json` | `c34db28` |
| PR #556 "game improvements": town upgrades, resource dashboard, NPC task queue, game speed controls, game modes (endless, sandbox, challenges, NG+), high scores, combo + elemental combat, bosses, dynamic quests, building history | `src/components/ui/{TownUpgradesPanel,ResourceDashboard,NPCTaskQueue,GameSpeedControls,GameModeSelector,EndlessModeHUD,HighScoresPanel}.jsx`, `src/systems/{EndlessMode,SandboxMode,ChallengeManager,NewGamePlus,GameModeManager,DynamicQuestGenerator,BuildingHistory}.js`, `src/modules/combat/{ComboSystem,ElementalSystem}.js`, `src/data/bosses.js`, `src/config/challenges.js`, `src/persistence/HighScoreManager.js` | `47fa46c` |
| Skill tree / character sheet UI (spend skill & attribute points) | `src/components/ui/{SkillTreeUI,CharacterSheet,CharacterSystemUI,ActiveSkillBar}.jsx` | `03ee304` (pre-cleanup `main`) |
| Quest UI | `src/components/quest/{QuestJournal,QuestTracker}.jsx` | `03ee304` |
| Settlement dashboard / NPC cards | `src/components/ui/ResourceDashboard.jsx`, `src/components/npc/*` | `03ee304` |
| Weather & seasons simulation | `src/modules/environment/{WeatherSystem,SeasonalSystem,WeatherGameplayEffects}.js` | `03ee304` |
| Multiplayer network abstraction | `src/core/NetworkLayer.js` | `03ee304` |
| Object pooling | `src/systems/pools/PoolManager.js` | `03ee304` |

Most of the 2D-era UI targeted a different layout (sidebars, tile grid) and would need adapting; the companion story, skill-tree UI, quest UI and weather simulation are the most directly reusable.

Still in the codebase but unused: `src/modules/settlement/` (kept for the unification plan) and the legacy Monster-class combat path in `useGameStore` (`attackMonster`, `handleMonsterDeath`, `aiSystemManager`), which rift enemies never take.

---

## Documentation drift

| Doc | Problem |
|-----|---------|
| `README.md` | Describes the 2D settlement game ("production ready", 6 resources, tiers, 50 achievements, 12-step tutorial) — none of which matches the 3D game. |
| `docs/3D_IMPLEMENTATION_PLAN.md` | "Current State" lists components that no longer exist (`VoxelTerrain.jsx`, `WaveManager.jsx`) and AI systems from the 2D build; references point into `documentation/archive-code`. |
| `docs/phases/PHASE_2_DETAILED_PLAN.md` | §2.0 relies on `ModuleOrchestrator`/`GameManager`; superseded by `.claude/plans/phase2-settlement-unification.md`. Exit-criteria checkboxes are all unchecked though most of the core loop is done. |
| `documentation/planning/*_2D.md` | Duplicates of the archived vision/roadmap for the 2D game. |

---

## Recommended next steps (in priority order)

1. **Make the companion playable** — it's the vision's emotional core and the biggest gap. Restore `CompanionStoryManager` + dialogue from `c34db28`, trigger discovery near a rift, call `setCompanionState({ active: true })`, `openDialogue(...)`, and `unlockSpell(...)` at bond milestones.
2. ~~**Finish Phase 2's player-facing half**~~ — done 2026-11-15 (schedule, housing, farming, dashboard, NPC panel, building panel and upgrades, on the unified settlement engine).
3. **Turn constants into behavior**: tool durability, shelter health/stamina regen and monster exclusion, a wooden tool tier.
4. **Give progression a UI**: a skill-tree / character sheet so earned skill points can be spent.
5. **Connect weather** (set `store.weather` from a simple weather timer) and **quests** (call `initializeAllQuests`, add a small tracker).
6. **Phase 3 completion**: rift resurgence after closing, raids on the settlement, NPC guards, a couple of distinct monster behaviors.
7. **Measure Phase 0 performance targets** with the dev overlay and decide whether object pooling is still needed.
8. **Refresh the docs**: rewrite `README.md` for the 3D game (only its name and intro were updated), update the 3D plan's "Current State". The Phase 2 and 3 plans were brought up to date on 2026-11-15.
