# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
npm install          # Install dependencies
npm start            # Start Vite dev server at http://localhost:3000
npm run build        # Production build (output: build/)
npm run deploy       # Build and deploy to GitHub Pages
```

## Testing

Uses **Vitest** (not Jest). Tests colocated in `__tests__/` subdirectories.

```bash
npm test                                    # Run all tests once (vitest run)
npm run test:watch                          # Watch mode
npx vitest run path/to/file.test.js         # Single test file
npx vitest run -t "test name pattern"       # Run tests matching name
npm run build && npm run test:smoke         # Start the built game in headless Chromium (scripts/smoke-test.mjs; SMOKE_CHROMIUM_PATH=<chrome> if Playwright's browser isn't installed)
```

Test setup (`src/setupTests.js`) provides: fake-indexeddb, Canvas 2D mock, rAF polyfill, TextEncoder/TextDecoder, crypto.subtle mock, and a **seeded `Math.random` reset before every test** (results are reproducible; use `vi.spyOn(Math, 'random')` for specific values). Vitest globals (`vi.fn`, `describe`, `it`) available without import.

- Test files containing JSX must use the `.jsx` extension. `vi.mock` factories must return a module object (`{ default: ... }`), and tests use ESM imports, not `require()`.
- 3D component tests import `src/components/3d/testSetup.js` first: it swaps `@react-three/*` for the DOM mocks in `src/__mocks__/@react-three/` and stubs `Worker`. The fiber mock's `advanceFrames(n, delta)` runs mounted `useFrame` callbacks so frame logic can be tested.

## Linting & Formatting

```bash
npm run lint         # ESLint check
npm run lint:fix     # ESLint auto-fix
npm run format       # Prettier (singleQuote, trailingComma: es5, semi: true)
```

ESLint 9, flat config in `eslint.config.mjs` (lints `.js` and `.jsx` under `src/`; fails on any error or on more than 34 warnings, today's count, via `--max-warnings` in `npm run lint`: fix warnings and lower the cap, never raise it): `no-unused-vars: warn`, `no-console: warn` (except warn/error), `react/no-unknown-property: off` (needed for R3F). Only the two classic react-hooks rules are on; react-hooks 7's React Compiler rules are not.

CI (`.github/workflows/deploy.yml`, workflow "CI") runs on every branch push and PR, on Node from `.nvmrc` (22): one `check` job does lint → unit tests → build → browser smoke test. Only `main` deploys to GitHub Pages, after `check` passes. `main` is protected: `check` must pass on a commit before it can land there, so push the branch and wait for its run before fast-forwarding main (no force pushes). Dependabot (`.github/dependabot.yml`) opens weekly npm and monthly Actions update PRs.

## Architecture Overview

The game is a single 3D real-time app: `index.jsx` → `App3D.jsx` → `Experience.jsx` → R3F components + the `useGameStore` Zustand store, inside a React Three Fiber `<Canvas>`. The old 2D game and the `GameManager`/`ModuleOrchestrator` module system were removed (they were never reachable from the app); `git log` has them if needed.

`src/modules/` now holds only modules the 3D game uses or is about to: `character/` (attributes, skill trees), `crafting/`, and `settlement/` + `hauling/` + `construction/` + `voxel/` + `npc-system/NPCPersonality.js`, which form the headless settlement engine. The live game runs it through `SettlementBridge` (see Settlement System below).

### 3D Rendering Pipeline

```
App3D.jsx (Canvas + UI overlay)
  → Experience.jsx (Physics, scene setup)
    → useChunkSystem hook → ChunkManager + WorkerPool
      → chunkWorker.js (terrain generation + meshing, off-thread)
    → ChunkRenderer (visible chunk meshes)
    → Player, Enemy, SettlerNPC, WildlifeAnimal (physics entities)
    → Invisible tick components (SettlementTick, SurvivalTick, RiftController, ConstructionTick)
```

Tick components use `useFrame` inside R3F Canvas to drive game logic each frame.

### State Management

- **`useGameStore`** (`src/stores/useGameStore.js`, ~1730 lines) — Primary store. Player, enemies, projectiles, settlement NPCs, zones, world time, UI state, inventory. Almost all 3D components read/write here. Store actions are wrapped by `ActionHistory` middleware (`src/systems/state/ActionSystem.js`) for replay/rollback/debugging.
- **`useQuestStore`** — Quest progress and objectives (driven by `systems/QuestManager.js` + JSON definitions in `src/config/quests/`; no quest UI yet).

Pattern: Game logic writes to stores via actions. 3D components subscribe to slices. No circular deps — modules don't read components.

### Settlement System

Live path: `SettlementTick.jsx` (useFrame loop, early-returns unless `gameState === 'playing'`) → `SettlementBridge.js` → `SettlementModule.tickSettlementCore()`. `SettlementTick` creates the module on mount and publishes it as `store._settlementModule`; it holds no game logic.

- `SettlementModule.tickSettlementCore` — campfire detection (one loaded chunk per scan), attractiveness (`systems/settlement/AttractivenessCalculator` via `ChunkAttractivenessAdapter`), immigration, the periodic task scan, and the per-NPC tick.
- `NPCStateMachine.tickNPC` — needs decay, happiness, unhappy-day departure, and the APPROACHING/EVALUATING/IDLE/WANDERING/SOCIALIZING/EATING/SLEEPING/LEAVING states.
- `NPCWorkBehavior` — the work loop (WORKING_MINE / WORKING_HAUL with `haulPhase` / WORKING_BUILD), needs interrupts and task resume. Tasks come from the singleton registry in `systems/settlement/TaskAssignmentEngine` (also read by `ConstructionTick`).
- The store stays the source of truth for NPCs, zones, stockpiles and construction sites (that is what gets saved); the module only keeps timers. It reads the store state each frame and changes the world through two ports the bridge supplies: a chunk adapter (`getBlock`/`setBlock`) and a host (store actions for stockpiles, inventory and construction). Tests drive it headless with the fakes in `modules/settlement/__tests__/helpers/fakeWorld.js`.
- `housing.js` — homes are completed construction sites whose building has `effects.housing` beds (`data/buildings.js`). Population cap = `max(HOUSING_FREE_SETTLERS, beds)`. Each needs tick re-assigns settled NPCs' `homeId` (the only stored housing state); homeless settlers get `HOUSING_HOMELESS_HAPPINESS_PENALTY` and sleep by the campfire, housed ones sleep on their home's doorstep (settlers can't path inside buildings).
- `schedule.js` — the daily routine, single source of truth for its timing: night (`SUNSET_END`→`SUNRISE_START`) SLEEP, dawn MEAL, morning/afternoon WORK around a lunch MEAL, evening LEISURE; diligent/lazy shift the work hours. `tickNPC` reads it via `context.timeOfDay`: no new work off-shift, one meal per mealtime (`npc.lastMeal`), workers park their task at nightfall and resume at dawn, sleepers stay down until dawn (hunger decays slower, social not at all). Without `timeOfDay` (pure unit tests) there is no schedule.
- `farming.js` — FARMING zones store `zone.farmTiles` (`{x, y, z, plantedAt, collectedAt}`); a tile's stage (EMPTY/GROWING/READY) is derived from `plantedAt` and world time, so growth needs no ticking. A farm only works within `FARM_PLOT_RANGE` of a completed Farm Plot building. `TaskAssignmentEngine` makes FARM tasks (plant/harvest, ≤ `MAX_FARMERS_PER_ZONE`), `NPCWorkBehavior.tickFarm` does them (harvests become `vegetable` in a stockpile), and untended ripe crops trickle in via `collectUnattended`. `FarmVisual.jsx` renders soil/sprouts/crops.
- `settlementSummary.js` — pure population/resources/buildings/alerts summaries for `components/ui/SettlementDashboard.jsx` (N key or HUD button; re-reads the store once a second while open; clicking a settler opens `NPCPanel`).
- `buildingInfo.js` — placed-block positions, demolish refund, construction ETA, residents and farms a plot powers, for `components/ui/BuildingPanel.jsx` (E near a site within `CONSTRUCTION_INTERACT_RANGE`, or a completed building within `BUILDING_INTERACT_RANGE`) and the store's `demolishBuilding` (clears only blocks still matching the blueprint, refunds `BUILDING_DEMOLISH_REFUND`). Both block-placing paths (`ConstructionTick`, settler `tickBuild`) go through `placeNextBlock`. Upgrades (`building.upgrade = { to, cost, settlers }`, Shelter → House → Manor) turn the same site (same id) into a PLACED site for the bigger blueprint with `upgradeFrom` set: `getHomes` keeps counting the old building's beds until it completes, the first block clears old blocks the new blueprint leaves empty, and `removeConstructionSite` reverts an upgrade only while it's still PLACED.
- `SettlerNPC.jsx` moves NPCs toward `targetPosition` and performs the on-arrival transitions (APPROACHING → EVALUATING, WANDERING/SOCIALIZING → IDLE).
- The class-based sub-managers in `SettlementModule.initialize()` (ZoneManager, StockpileManager, HousingManager, Mining/FarmingZoneBehavior, HaulingManager, ConstructionManager, ImmigrationManager) and `SettlementModule.update()` are not on the live path; they are seams for later features.

NPC states: `APPROACHING → EVALUATING → IDLE ⇄ WANDERING / SOCIALIZING / EATING / SLEEPING / WORKING_MINE / WORKING_HAUL / WORKING_BUILD → LEAVING`

### Web Workers

| Worker | Purpose |
|--------|---------|
| `chunkWorker.js` | Seeded terrain generation (height maps, biomes, ores) and block → geometry meshing with face culling and LOD |

WorkerPool (`src/systems/workers/WorkerPool.js`) caps at `Math.min(navigator.hardwareConcurrency, 4)` threads.

### Game Systems (`src/systems/`)

| System | Key files | Purpose |
|--------|-----------|---------|
| `chunks/` | ChunkManager, Chunk, LODGenerator, coordinates, blockTypes | Voxel terrain loading/unloading, coordinate math |
| `combat/` | enemyHits.js | Enemy damage pipeline via `store._enemyHandlers` |
| `survival/` | HungerSystem, ShelterDetector, CorruptionManager, RiftManager | Hunger/shelter/rift mechanics |
| `settlement/` | AttractivenessCalculator, MiningZoneScanner, TaskAssignmentEngine | Settlement utilities used by the settlement engine (`modules/settlement/`) |
| `lighting/` | DayNightLighting.js | Day/night cycle lighting |
| `time/` | TimeManager.js | World time progression |
| `story/` | DialogueEngine.js | NPC dialogue system |
| `workers/` | WorkerPool.js | Thread pool for chunk workers |
| `state/` | ActionSystem.js | Action history middleware (replay, rollback, debugging) |
| `LootGenerator`, `LootTable`, `LootIntegration` | (root-level) | Loot drop/pickup pipeline |
| `QuestManager` | (root-level) | Quest state machine driven by `src/config/quests/*.json` |

### Key Data Files

- **`src/data/tuning.js`** — Single source of truth for ALL balance constants (day length, hunger rates, mining speeds, immigration thresholds, rift spawning, etc.). Never hardcode gameplay numbers.
- **`src/data/zoneTypes.js`** — Zone type definitions (MINING, STOCKPILE, FARMING, BUILDING, RESTRICTED).
- **`src/data/blockDrops.js`** — Block → loot tables, calculated via `calculateDrops(blockType, toolTier)`. Also defines `BLOCK_PLACEMENT_COSTS`.
- **`src/data/spells.js`** — Spell definitions with cooldowns and mana costs.
- **`src/data/buildings.js`** — Building blueprints for the construction system.
- **`src/data/craftingRecipes.js`** — Crafting recipe definitions.
- **`src/data/wildlifeTypes.js`** — Wildlife animal type definitions.
- **`src/config/loot/*.json`** — Item templates, properties, rarity config, monster loot tables (JSON data, not code).
- **`src/config/quests/*.json`** — Quest definitions (story, exploration, settlement) consumed by QuestManager.

### Persistence

Save/load in `src/persistence/Game3DSaveManager.js` (IndexedDB `voxel3d-saves`, schema v7, migrations inline in `migrateSave`). Main state + all modified chunks are written in one transaction. Rift state is saved via `RiftManager.serialize()`; a load before `RiftController` mounts waits in `store._pendingRiftState`. `TestNotesManager.js` stores QA tracker notes.

### Chunk System Constants

`VOXEL_SIZE=2`, `CHUNK_SIZE=16`, `CHUNK_SIZE_Y=32` (taller for underground depth). Block types are `Uint8Array` IDs (0–255) in `src/systems/chunks/blockTypes.js`. ChunkManager exposes `getBlock(wx,wy,wz)` and `setBlock()` for world-space block access. Coordinate conversion in `src/systems/chunks/coordinates.js`.

## Key Patterns

- **drei Text/Billboard components cause WebGL shader corruption** — use mesh-based UIs instead.
- **Name and icons**: the game is called **Riftholm** (the repo and the `/voxel-rpg-game/` base path keep the old name). App icons and the start-screen mark are generated: `python3 scripts/icons/make_icons.py public/icons` writes `icon.svg` and `rift-mark.svg`, then `node scripts/icons/raster.cjs public/icons` renders the PNG sizes (needs Playwright). `src/__tests__/appManifest.test.js` checks every icon the manifest and `index.html` reference exists.
- **HTML UI look**: shared primitives in `src/styles/voxel-ui.css` (`.vx-panel`, `.vx-btn` + `--primary/--danger/--lg`, `.vx-key`, `.vx-bar` with `--bar`/`--fill`, `.vx-chip`) and `--vx-*` color tokens. The pixel font (`--vx-font-display`, Silkscreen from Google Fonts) is only for titles and buttons; small labels and numbers use `--vx-font-ui`. `GameUI.jsx` renders `ui/StartScreen.jsx` while `gameState === 'intro'` (Continue loads the `default` save slot) and the HUD (`GameUI.css`) while playing.
- Camera pitch stored in `camera.pitch` (radians, clamped ±1.05 ≈ 60°).
- `dealDamageToPlayer(damage, source)` — second arg tracks death cause for DeathScreen.
- Tool tier stored in `stats.toolTier` on crafting recipes.
- Enemy.jsx accepts optional `monsterData` prop for rift-spawned enemies vs hardcoded defaults.
- Mobile touch handlers need gesture disambiguation (tap vs drag) using time + distance thresholds.
- `useEffect` deps in CameraRotateControls: only `[gl]` — reads store via `getState()` to avoid stale closures.
- **Never subscribe to `state.player` or `state.player.position` in components** — position changes every frame. Read it with `getState()` inside `useFrame`, use `useShallow(selectPlayerStats)` for HUD-style stats, or select a coarse derived value (e.g. chunk key).
- Move the player with `teleportPlayer(pos)` / `pendingTeleport` (Player.jsx moves the physics body); writing `player.position` alone is overwritten by physics next frame.
- Rift enemies are plain data; their health lives in `Enemy.jsx`. Damage them through `store._enemyHandlers` (see `src/systems/combat/enemyHits.js`), with live positions from `store._enemyPositions`.
- Gameplay must stop while `gameState === 'paused'` (Physics is paused; `useFrame` loops should early-return).
- The player, settlers, animals and rift monsters are voxel rigs built with `src/components/3d/voxelRig.js`: colored boxes on a small skeleton, merged into one cached skinned geometry per kind (1 draw call each; `glow` parts such as eyes go in a second, unlit mesh). Models and pure animation modules live in `components/3d/wildlife/` (`animalModels.js`, `animalAnimation.js`) and `components/3d/enemies/` (`enemyModels.js`, `enemyAnimation.js`: hop/biped/crawl gaits, attack swing, hit recoil, death). `wildlifeTypes.js` and `MONSTER_TYPES` hold only behavior and stats.
- People share `components/3d/characters/` (`humanoidModel.js`: one skeleton, looks from `PLAYER_LOOK` or `getSettlerLook(npc)` by job; `humanoidAnimation.js`: walk/run/jump, sword/cast/place actions, mine/build/farm/carry/eat/wave activities). Tools hang on their own bones and are shown/hidden by bone scale. Player actions reach the animation through `systems/playerActions.js` (`notePlayerAction`).
- Rendering is flat (no tone mapping, `<Canvas flat>`) with physical light units: diffuse light is divided by π, so intensities in `tuning.js` (`LIGHT_*`) are ~1.5–2. Vertex colors are lit in linear space: author colors as sRGB and convert (`THREE.Color.set('#hex')` does it; the chunk worker uses `lin()`), or they render pale.
- Chunk faces must be wound counter-clockwise seen from outside (the terrain material is double-sided, so wrong winding silently flips lighting). `chunkWorker.js` also builds a separate decoration mesh (grass tufts, flowers, pebbles, berries) that ChunkRenderer draws without physics; terrain colors use world coordinates so they're seamless across chunks. Changing terrain *generation* would alter existing worlds (unmodified chunks regenerate from the seed), so art changes stay in meshing.
- Sky: `SkyDome.jsx` (gradient dome, sun glow, stars, voxel clouds) with colors from `DayNightLighting.js` (`getSkyColor` zenith, `getHorizonColor`, fog = horizon).
- Block placement goes through `tryPlaceBlock` in BlockInteraction.jsx, which charges `BLOCK_PLACEMENT_COSTS` (`src/data/blockDrops.js`).
- World edits survive chunk unloads via `ChunkManager.modifiedChunkCache`; saves use `getModifiedChunks()` / `applyModifiedChunks()`.
- Debug tools load only in dev builds or with `?debug=1` (remembered; `?debug=0` turns it off) — see `src/utils/debugFlags.js`:
  - **Dev overlay** (`src/components/dev/DevOverlay.jsx`): F3 cycles closed → full → mini perf strip; F4 opens the Settlement tab; DEV button on touch devices. Tabs: Perf (frame-time graph vs. 60 fps budget, draw calls, chunks, workers, entities), Player (stats + cheats: heal, god mode, materials, XP, teleports), World (time controls, spawn/kill enemies, a raid "Stress test" (25 enemies + 8 settlers; numbers in `docs/research/PERFORMANCE_BASELINE.md`), rifts, quick save/load in its own slot), Settlement (NPCs, zones, Phase 2 checks). Cheats live in `devActions.js`; renderer stats come from `DebugStatsTick` in Experience.jsx via `store._debugStats`.
  - **QA tracker** (backtick): manual test checklist (`TestTracker.jsx`, criteria in `data/testCriteria.js`).

## Key Files

- `src/App3D.jsx` — Main 3D game component entry point
- `src/components/3d/Experience.jsx` — Scene setup, entity rendering, tick orchestration
- `src/stores/useGameStore.js` — Central Zustand store (~1730 lines)
- `src/persistence/Game3DSaveManager.js` — Save/load
- `src/data/tuning.js` — All gameplay balance constants
- `src/systems/chunks/ChunkManager.js` — Terrain chunk loading/unloading
- `src/components/3d/SettlementTick.jsx` — Per-frame driver for the settlement engine (thin bridge loop)
- `src/modules/settlement/SettlementBridge.js` — Module ↔ store bridge (chunk adapter, host port, result sync)
- `src/entities/Item.js`, `src/entities/Quest.js` — Data classes for loot items and quests

**Note:** `README.md` describes the old 2D architecture (GameManager, ModuleOrchestrator, Canvas 2D) that no longer exists. This CLAUDE.md is the authoritative architecture reference.
