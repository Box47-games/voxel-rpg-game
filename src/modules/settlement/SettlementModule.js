/**
 * SettlementModule.js - Headless settlement engine for the 3D game
 *
 * LIVE PATH: SettlementTick.jsx → SettlementBridge → tickSettlementCore().
 * It runs campfire detection, attractiveness, immigration, the NPC needs/state
 * machine (NPCStateMachine) and the work loop (NPCWorkBehavior). The Zustand
 * store stays the source of truth for NPCs, zones, stockpiles and construction
 * sites (that is what gets saved); this module only keeps timers and other
 * throwaway state, and changes the world through the host port it is given.
 *
 * NOT ON THE LIVE PATH (yet): update() and the class-based sub-managers created
 * in initialize() — ZoneManager, Mining/FarmingZoneBehavior, StockpileManager,
 * HaulingManager, ConstructionManager, HousingManager, ImmigrationManager. They
 * keep their own state, are covered by their own tests, and are the seams for
 * later features (farming zones, housing assignment). Nothing feeds them from
 * the store today.
 */

import {
  IMMIGRATION_CHECK_INTERVAL,
  ATTRACT_RECALC_INTERVAL,
  IMMIGRATION_THRESHOLD,
  IMMIGRATION_THRESHOLD_PER_NPC,
  IMMIGRATION_SPAWN_MIN_DIST,
  IMMIGRATION_SPAWN_MAX_DIST,
  NPC_NEEDS_TICK_INTERVAL,
  WORK_SCAN_INTERVAL,
  SETTLEMENT_CAMPFIRE_SCAN_INTERVAL,
  NPC_INITIAL_HUNGER,
  NPC_INITIAL_REST,
  NPC_INITIAL_SOCIAL,
  NPC_INITIAL_HAPPINESS,
} from '../../data/tuning.js';

import AttractivenessCalculator from './AttractivenessCalculator.js';
import ImmigrationManager from './ImmigrationManager.js';
import NPCIdentityGenerator from './NPCIdentityGenerator.js';
import ZoneManager from './ZoneManager.js';
import MiningZoneBehavior from './MiningZoneBehavior.js';
import FarmingZoneBehavior from './FarmingZoneBehavior.js';
import StockpileManager from './StockpileManager.js';
import { HaulingManager } from '../hauling/HaulingManager.js';
import { ConstructionManager } from '../construction/ConstructionManager.js';
import HousingManager from './HousingManager.js';
import ChunkAttractivenessAdapter from './ChunkAttractivenessAdapter.js';
import { scanChunkForCampfire, getTerrainYAt } from './CampfireDetector.js';
import { tickNPC } from './NPCStateMachine.js';
import { getHomes, getPopulationCap, assignHomes } from './housing.js';
import { getTimeOfDay } from './schedule.js';
import { generateNPCIdentity } from '../../data/npcIdentity.js';
import { scanForTasks } from '../../systems/settlement/TaskAssignmentEngine.js';

class SettlementModule {
  /**
   * @param {Object} [deps] - Optional collaborators for the legacy update() path.
   *   The live game constructs the module with none.
   */
  constructor(deps = {}) {
    this.npcManager = deps.npcManager || null;
    this.storage = deps.storage || null;
    this.townManager = deps.townManager || null;
    this.grid = deps.grid || null;
    this.buildingConfig = deps.buildingConfig || null;
    this.territoryManager = deps.territoryManager || null;
    this.npcNeedsTracker = deps.npcNeedsTracker || null;

    // Sub-managers (created in initialize)
    this.attractivenessCalculator = null;
    this.immigrationManager = null;
    this.identityGenerator = null;
    this.zoneManager = null;
    this.miningBehavior = null;
    this.farmingBehavior = null;
    this.stockpileManager = null;
    // Sub-managers (created in initialize, Batches 5-8):
    this.haulingManager = null;
    this.constructionManager = null;
    this.housingManager = null; // Not on the live path; live housing is ./housing.js

    // Timing
    this.tickCount = 0;
    this.elapsedTime = 0; // total seconds elapsed

    // Event listeners
    this._eventListeners = new Map();

    // ── Core tick state (used by tickSettlementCore, driven by the bridge) ──
    this.chunkAdapter = null;
    this.host = null;
    this.chunkAttractiveness = null;
    this._warnedNPCs = new Set();
    this._npcIdCounter = 0;
    this._campfireAccum = 0;
    this._campfireScanIdx = 0;
    this._attractAccum = 0;
    this._immigrationAccum = 0;
    this._needsAccum = 0;
    this._workScanAccum = 0;
    // Reused every frame so the per-frame tick allocates nothing.
    this._results = {
      campfireCenter: null,
      attractivenessUpdated: false,
      attractiveness: 0,
      wallCount: 0,
      newNPC: null,
      batchUpdates: null,
      removeIds: null,
      notifications: null,
      needsTicked: false,
    };

    this.initialized = false;
  }

  /**
   * Initialize all sub-managers. Must be called before the first tick.
   */
  initialize() {
    if (this.initialized) return;

    this.attractivenessCalculator = new AttractivenessCalculator({
      storage: this.storage,
      townManager: this.townManager,
      grid: this.grid,
      buildingConfig: this.buildingConfig,
      territoryManager: this.territoryManager,
      npcManager: this.npcManager,
    });

    this.identityGenerator = new NPCIdentityGenerator();

    // Register existing NPC names so they aren't reused
    if (this.npcManager && this.npcManager.npcs) {
      for (const npc of this.npcManager.npcs.values()) {
        if (npc.name) this.identityGenerator.registerName(npc.name);
      }
    }

    // LEGACY: ImmigrationManager is kept for serialization compatibility but
    // no longer drives live immigration (handled by tickSettlementCore).
    // npcManager is null to prevent it from spawning class-instance NPCs.
    this.immigrationManager = new ImmigrationManager({
      attractivenessCalculator: this.attractivenessCalculator,
      npcManager: null,
      townManager: this.townManager,
      storage: this.storage,
      settlementModule: this,
      identityGenerator: this.identityGenerator,
    });

    this.zoneManager = new ZoneManager({
      grid: this.grid,
      settlementModule: this,
    });

    this.miningBehavior = new MiningZoneBehavior({
      zoneManager: this.zoneManager,
      grid: this.grid,
      settlementModule: this,
    });

    this.farmingBehavior = new FarmingZoneBehavior({
      zoneManager: this.zoneManager,
      settlementModule: this,
    });

    this.stockpileManager = new StockpileManager({
      zoneManager: this.zoneManager,
      storage: this.storage,
      settlementModule: this,
    });

    // Wire zone events to sub-managers
    this.on('zone:created', ({ zone }) => {
      this.miningBehavior.onZoneCreated(zone);
      this.farmingBehavior.onZoneCreated(zone);
      this.stockpileManager.onZoneCreated(zone);
    });
    this.on('zone:deleted', ({ zone }) => {
      this.miningBehavior.onZoneDeleted(zone);
      this.farmingBehavior.onZoneDeleted(zone);
      this.stockpileManager.onZoneDeleted(zone);
    });

    // Batch 5-6: Construction + Hauling
    this.constructionManager = new ConstructionManager({
      maxActiveSites: 10,
    });

    this.haulingManager = new HaulingManager({
      stockpileManager: this.stockpileManager,
      constructionManager: this.constructionManager,
    });

    // Batch 8: Housing
    this.housingManager = new HousingManager();

    // Chunk-based attractiveness calculator (used by tickSettlementCore)
    this.chunkAttractiveness = new ChunkAttractivenessAdapter();

    this.initialized = true;
  }

  /**
   * Set the chunk adapter (world block access).
   * Called by SettlementBridge when chunkManager becomes available.
   * @param {Object} adapter - { iterateChunks(), getBlock(), setBlock(), getRawChunkManager() }
   */
  setChunkAdapter(adapter) {
    this.chunkAdapter = adapter;
  }

  /**
   * Set the host port: how the engine changes the world outside the NPC list.
   * The live implementation (SettlementBridge) forwards to useGameStore.
   *
   * @param {Object} host
   * @param {() => Object[]} host.getZones - Current zones (fresh, not the tick snapshot)
   * @param {() => Object[]} host.getConstructionSites - Current construction sites (fresh)
   * @param {(zoneId, material, amount) => void} host.consumeFromStockpile
   * @param {(zoneId, updates) => void} host.updateZone
   * @param {(material, amount) => void} host.addMaterial - To the player's inventory
   * @param {(material, amount) => void} host.removeMaterial - From the player's inventory
   * @param {(siteId, material, amount) => void} host.npcDeliverToConstruction
   * @param {(siteId) => void} host.advanceConstruction
   * @param {(text, color) => void} host.addPickupText
   */
  setHost(host) {
    this.host = host;
  }

  /**
   * Update the class-based sub-managers for one tick.
   * Not called by the live game (see the file header); kept for the sub-manager tests.
   *
   * @param {number} deltaTime - Time since last tick in milliseconds
   * @param {Object} gameState - Current game state from orchestrator
   * @returns {Object} Settlement tick results
   */
  update(deltaTime, gameState) {
    if (!this.initialized) return { settlement: null };

    const deltaSeconds = deltaTime / 1000;
    this.tickCount++;
    this.elapsedTime += deltaSeconds;

    const result = {
      settlement: {
        tick: this.tickCount,
        attractiveness: 0,
        immigration: null,
        errors: [],
      }
    };

    try {
      // ── Step 1: Immigration (LEGACY — handled by tickSettlementCore) ──
      // Attractiveness recalc via orchestrator still runs for non-chunk callers
      this.attractivenessCalculator.recalculate(gameState);
      result.settlement.attractiveness = this.attractivenessCalculator.getScore();

      // ImmigrationManager is skipped here — live immigration is handled by
      // tickSettlementCore() which creates flat NPC objects in the Zustand store.
      // Keeping the manager instantiated for its statistics/serialization.
      result.settlement.immigration = null;

      // ── Step 2: Zone ──────────────────────────────────────
      const zoneResult = this.zoneManager.update(deltaSeconds, gameState);
      result.settlement.zones = zoneResult;

      // ── Step 2b: Zone Behaviors ────────────────────────────
      const miningResult = this.miningBehavior.update(deltaSeconds);
      result.settlement.mining = miningResult;

      const farmingResult = this.farmingBehavior.update(deltaSeconds);
      result.settlement.farming = farmingResult;

      // ── Step 3: Stockpile ─────────────────────────────────
      const stockpileResult = this.stockpileManager.update(deltaSeconds);
      result.settlement.stockpiles = stockpileResult;

      // ── Step 4: Construction ──────────────────────────────
      // Construction site progress is tracked; completion events emitted
      if (this.constructionManager) {
        for (const site of this.constructionManager.getAllSites()) {
          if (site.isComplete && site.isComplete() && !site._completionEmitted) {
            site._completionEmitted = true;
            this.emit('construction:complete', { site });
          }
        }
      }

      // ── Step 5: Hauling ───────────────────────────────────
      // Hauling manager scans for tasks and manages task lifecycle
      if (this.haulingManager && this.haulingManager.enabled) {
        this.haulingManager.update(deltaSeconds, gameState);
      }

    } catch (err) {
      console.error('[SettlementModule] Tick error:', err);
      result.settlement.errors.push(err.message);
    }

    return result;
  }

  // ── Core Settlement Tick (driven by SettlementBridge) ──────

  /**
   * Run one frame of the live settlement simulation: campfire detection,
   * attractiveness, immigration, task scanning and the NPC state machines.
   * Called every frame; internal accumulators gate the actual work.
   *
   * World changes (stockpiles, inventory, blocks, construction) are applied
   * immediately through the host. Changes to the settlement slice itself come
   * back in the result for the bridge to write.
   *
   * The returned object is reused between calls — read it, don't keep it.
   *
   * @param {number} deltaSeconds - Frame delta in seconds (from useFrame)
   * @param {Object} state - Game state as of the start of the frame:
   *   { settlement, zones, constructionSites, inventory, rifts, worldTime }
   *   (the live bridge passes the store state itself)
   * @returns {Object|null} Results for the bridge to sync back to the store
   */
  tickSettlementCore(deltaSeconds, state) {
    if (!this.initialized || !this.chunkAdapter || !this.host) return null;

    const settlement = state.settlement;
    if (!settlement) return null;

    const results = this._results;
    results.campfireCenter = null;
    results.attractivenessUpdated = false;
    results.newNPC = null;
    results.batchUpdates = null;
    results.removeIds = null;
    results.notifications = null;
    results.needsTicked = false;

    // ── 1. Campfire detection (until a center is found) ──
    this._campfireAccum += deltaSeconds;
    const center = settlement.settlementCenter;
    if (!center) {
      // No settlement (new game / reset): forget warnings from the last one
      if (this._warnedNPCs.size > 0) this._warnedNPCs.clear();

      if (this._campfireAccum >= SETTLEMENT_CAMPFIRE_SCAN_INTERVAL) {
        this._campfireAccum = 0;
        results.campfireCenter = this._scanNextChunkForCampfire();
      }
      return results; // No center yet — skip everything else
    }

    // ── 2. Attractiveness recalc ──
    this._attractAccum += deltaSeconds;
    if (this._attractAccum >= ATTRACT_RECALC_INTERVAL) {
      this._attractAccum = 0;
      this.chunkAttractiveness.recalculate(center, this.chunkAdapter, state);
      results.attractiveness = this.chunkAttractiveness.getScore();
      results.wallCount = this.chunkAttractiveness.getWallCount();
      results.attractivenessUpdated = true;
    }

    // Immigration and EVALUATING NPCs deliberately use the attractiveness and
    // wall count from the start of the frame (i.e. the previous recalculation),
    // not the one computed just above. That is how the game has always behaved.

    // ── 3. Immigration check ──
    this._immigrationAccum += deltaSeconds;
    if (this._immigrationAccum >= IMMIGRATION_CHECK_INTERVAL) {
      this._immigrationAccum = 0;
      results.newNPC = this._tryImmigration(
        settlement, center, state.worldTime.elapsed, getHomes(state.constructionSites)
      );
    }

    // ── 3b. Work task scan ──
    this._workScanAccum += deltaSeconds;
    if (this._workScanAccum >= WORK_SCAN_INTERVAL) {
      this._workScanAccum = 0;
      scanForTasks(state.zones, state.constructionSites, this.chunkAdapter);
    }

    // ── 4. NPC needs + state machines ──
    this._needsAccum += deltaSeconds;
    if (this._needsAccum >= NPC_NEEDS_TICK_INTERVAL) {
      const tickDelta = this._needsAccum;
      this._needsAccum = 0;
      this._tickNPCs(tickDelta, settlement, center, state, results);
    }

    return results;
  }

  /** Scan one loaded chunk per call (round-robin) to amortize the cost. */
  _scanNextChunkForCampfire() {
    const chunks = Array.from(this.chunkAdapter.iterateChunks());
    if (chunks.length === 0) return null;
    const scanIdx = this._campfireScanIdx % chunks.length;
    this._campfireScanIdx = scanIdx + 1;
    return scanChunkForCampfire(chunks[scanIdx]);
  }

  /** @returns {Object|null} A new APPROACHING NPC if one is attracted this check */
  _tryImmigration(settlement, center, worldTimeElapsed, homes) {
    const npcCount = settlement.npcs.length;
    const threshold = IMMIGRATION_THRESHOLD + npcCount * IMMIGRATION_THRESHOLD_PER_NPC;

    // Population cap: one bed per settler, beyond the free pioneer(s)
    if (!(settlement.attractiveness >= threshold && npcCount < getPopulationCap(homes))) return null;

    const angle = Math.random() * Math.PI * 2;
    const dist = IMMIGRATION_SPAWN_MIN_DIST +
      Math.random() * (IMMIGRATION_SPAWN_MAX_DIST - IMMIGRATION_SPAWN_MIN_DIST);
    const spawnX = center[0] + Math.cos(angle) * dist;
    const spawnZ = center[2] + Math.sin(angle) * dist;
    const spawnY = getTerrainYAt(this.chunkAdapter, spawnX, spawnZ);

    const seed = Date.now() ^ (++this._npcIdCounter * 2654435761);
    const identity = generateNPCIdentity(seed);

    return {
      id: `npc_${Date.now()}_${this._npcIdCounter}`,
      ...identity,
      position: [spawnX, spawnY, spawnZ],
      targetPosition: [...center],
      facingAngle: 0,
      state: 'APPROACHING',
      stateTimer: 0,
      hunger: NPC_INITIAL_HUNGER,
      rest: NPC_INITIAL_REST,
      social: NPC_INITIAL_SOCIAL,
      happiness: NPC_INITIAL_HAPPINESS,
      unhappyDays: 0,
      dayCheckpoint: worldTimeElapsed,
      currentJob: null,
      arrivedAtSettlement: false,
    };
  }

  _tickNPCs(tickDelta, settlement, center, state, results) {
    const batchUpdates = {};
    const removeIds = [];
    const notifications = [];
    let anyTaskCompleted = false;

    const homes = getHomes(state.constructionSites);
    const context = {
      center,
      homes: new Map(homes.map((h) => [h.id, h])),
      homeAssignments: assignHomes(settlement.npcs, homes),
      timeOfDay: getTimeOfDay(state.worldTime),
      attractiveness: settlement.attractiveness,
      npcs: settlement.npcs,
      zones: state.zones,
      constructionSites: state.constructionSites,
      inventory: state.inventory,
      worldTimeElapsed: state.worldTime.elapsed,
      warnedNPCs: this._warnedNPCs,
      chunkAdapter: this.chunkAdapter,
      host: this.host,
      notifications,
    };

    for (const npc of settlement.npcs) {
      const { updates, remove, taskCompleted } = tickNPC(npc, tickDelta, context);
      if (remove) {
        removeIds.push(npc.id);
      } else {
        batchUpdates[npc.id] = updates;
      }
      if (taskCompleted) anyTaskCompleted = true;
    }

    // If any NPC completed a task, re-scan immediately so idle NPCs find new
    // work on the next tick instead of waiting for WORK_SCAN_INTERVAL. Uses
    // fresh zones/sites: they were changed through the host during this tick.
    if (anyTaskCompleted) {
      scanForTasks(this.host.getZones(), this.host.getConstructionSites(), this.chunkAdapter);
      this._workScanAccum = 0;
    }

    results.batchUpdates = batchUpdates;
    results.removeIds = removeIds;
    results.notifications = notifications;
    results.needsTicked = true;
  }

  // ── Event System ────────────────────────────────────────────

  /**
   * Emit a settlement event (used by sub-managers for hint triggers, etc.)
   * @param {string} eventName
   * @param {Object} data
   */
  emit(eventName, data) {
    const listeners = this._eventListeners.get(eventName);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(data);
        } catch (err) {
          console.error(`[SettlementModule] Event listener error for '${eventName}':`, err);
        }
      }
    }
  }

  /**
   * Subscribe to a settlement event
   * @param {string} eventName
   * @param {Function} callback
   */
  on(eventName, callback) {
    if (!this._eventListeners.has(eventName)) {
      this._eventListeners.set(eventName, []);
    }
    this._eventListeners.get(eventName).push(callback);
  }

  // ── Serialization ───────────────────────────────────────────

  /**
   * Serialize settlement state for save
   * @returns {Object} Serializable settlement state
   */
  serialize() {
    return {
      tickCount: this.tickCount,
      elapsedTime: this.elapsedTime,
      immigration: this.immigrationManager ? this.immigrationManager.serialize() : null,
      attractiveness: this.attractivenessCalculator ? this.attractivenessCalculator.getScore() : 0,
      identityGenerator: this.identityGenerator ? this.identityGenerator.serialize() : null,
      zones: this.zoneManager ? this.zoneManager.serialize() : null,
      mining: this.miningBehavior ? this.miningBehavior.serialize() : null,
      farming: this.farmingBehavior ? this.farmingBehavior.serialize() : null,
      stockpiles: this.stockpileManager ? this.stockpileManager.serialize() : null,
      // Batches 5-8 sub-managers
      hauling: this.haulingManager && this.haulingManager.toJSON ? this.haulingManager.toJSON() : null,
      construction: this.constructionManager && this.constructionManager.toJSON ? this.constructionManager.toJSON() : null,
      housing: this.housingManager ? this.housingManager.serialize() : null,
      // Core tick state
      npcIdCounter: this._npcIdCounter,
      warnedNPCs: Array.from(this._warnedNPCs),
    };
  }

  /**
   * Restore settlement state from save
   * @param {Object} state - Previously serialized state
   */
  deserialize(state) {
    if (!state) return;

    this.tickCount = state.tickCount || 0;
    this.elapsedTime = state.elapsedTime || 0;

    if (state.immigration && this.immigrationManager) {
      this.immigrationManager.deserialize(state.immigration);
    }
    if (state.identityGenerator && this.identityGenerator) {
      this.identityGenerator.deserialize(state.identityGenerator);
    }
    if (state.zones && this.zoneManager) {
      this.zoneManager.deserialize(state.zones);
    }
    if (state.mining && this.miningBehavior) {
      this.miningBehavior.deserialize(state.mining);
    }
    if (state.farming && this.farmingBehavior) {
      this.farmingBehavior.deserialize(state.farming);
    }
    if (state.stockpiles && this.stockpileManager) {
      this.stockpileManager.deserialize(state.stockpiles);
    }
    // Batches 5-8 sub-managers
    if (state.hauling && this.haulingManager && this.haulingManager.fromJSON) {
      this.haulingManager.fromJSON(state.hauling);
    }
    if (state.construction && this.constructionManager && this.constructionManager.fromJSON) {
      // ConstructionManager.fromJSON is static, but we can load into existing instance
    }
    if (state.housing && this.housingManager) {
      this.housingManager.deserialize(state.housing);
    }
    // Core tick state
    if (state.npcIdCounter != null) {
      this._npcIdCounter = state.npcIdCounter;
    }
    if (state.warnedNPCs) {
      this._warnedNPCs = new Set(state.warnedNPCs);
    }
  }

  // ── Statistics ──────────────────────────────────────────────

  getStatistics() {
    return {
      tickCount: this.tickCount,
      attractiveness: this.attractivenessCalculator ? this.attractivenessCalculator.getScore() : 0,
      immigration: this.immigrationManager ? this.immigrationManager.getStatistics() : null,
      zones: this.zoneManager ? { total: this.zoneManager.zones.size } : null,
      mining: this.miningBehavior ? { totalTasks: this.miningBehavior.tasks.size } : null,
      farming: this.farmingBehavior ? { totalTasks: this.farmingBehavior.tasks.size } : null,
      stockpiles: this.stockpileManager ? { total: this.stockpileManager.stockpiles.size } : null,
      initialized: this.initialized,
    };
  }
}

export default SettlementModule;
