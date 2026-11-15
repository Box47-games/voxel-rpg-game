/**
 * SettlementBridge.js — Bridges the React/Zustand world and the SettlementModule.
 *
 * Each frame: hand the module the store state, let it run tickSettlementCore(),
 * and write the settlement-slice results back. It also gives the module its two
 * ports onto the game: the chunk adapter (blocks) and the host (store actions
 * for stockpiles, inventory and construction).
 */

import useGameStore from '../../stores/useGameStore';

/**
 * The module's host port, backed by useGameStore. Every call reads the store
 * fresh, so effects applied earlier in the same tick are visible.
 */
function createStoreHost() {
  const store = () => useGameStore.getState();
  return {
    getZones: () => store().zones,
    getConstructionSites: () => store().constructionSites,
    consumeFromStockpile: (zoneId, material, amount) =>
      store().consumeFromStockpile(zoneId, material, amount),
    updateZone: (zoneId, updates) => store().updateZone(zoneId, updates),
    addMaterial: (material, amount) => store().addMaterial(material, amount),
    removeMaterial: (material, amount) => store().removeMaterial(material, amount),
    npcDeliverToConstruction: (siteId, material, amount) =>
      store().npcDeliverToConstruction(siteId, material, amount),
    advanceConstruction: (siteId) => store().advanceConstruction(siteId),
    addPickupText: (text, color) => store().addPickupText(text, color),
  };
}

class SettlementBridge {
  constructor(settlementModule) {
    this._module = settlementModule;
    this._chunkAdapter = null;
    if (this._module.setHost) {
      this._module.setHost(createStoreHost());
    }
  }

  /**
   * Set/update the chunk adapter. Called when chunkManager becomes available.
   * @param {Object} chunkManager - Raw chunkManager from the 3D engine
   */
  setChunkAdapter(chunkManager) {
    this._chunkAdapter = {
      iterateChunks: () => chunkManager.chunks.values(),
      getBlock: (wx, wy, wz) => chunkManager.getBlock(wx, wy, wz),
      setBlock: (wx, wy, wz, blockType) => chunkManager.setBlock(wx, wy, wz, blockType),
      getRawChunkManager: () => chunkManager,
    };
    this._module.setChunkAdapter(this._chunkAdapter);
  }

  /**
   * The game state the module ticks against: the store state as of now.
   * Returned as-is (no copy) so the per-frame tick allocates nothing; the
   * module reads settlement, zones, constructionSites, inventory, rifts and
   * worldTime from it and must not mutate it.
   */
  getGameState() {
    return useGameStore.getState();
  }

  /**
   * Run one frame of the settlement simulation.
   * The caller is responsible for not calling this while the game is paused.
   * @param {number} deltaSeconds
   */
  tick(deltaSeconds) {
    this.syncToStore(this._module.tickSettlementCore(deltaSeconds, this.getGameState()));
  }

  /**
   * Write module results back to useGameStore.
   *
   * @param {Object} results - Return value from settlementModule.tickSettlementCore()
   */
  syncToStore(results) {
    if (!results) return;

    const store = useGameStore.getState();

    // 1. Settlement center just detected — nothing else happened this frame
    if (results.campfireCenter) {
      store.setSettlementCenter(results.campfireCenter);
      return;
    }

    // 2. Attractiveness
    if (results.attractivenessUpdated) {
      store.updateSettlementAttractiveness(results.attractiveness);
      store.updateSettlementTimestamps({ lastAttractivenessCalc: Date.now() });
    }

    // 3. New NPC from immigration
    if (results.newNPC) {
      store.addSettlementNPC(results.newNPC);
      store.updateSettlementTimestamps({ lastImmigrationCheck: Date.now() });
    }

    // 4. NPC batch updates (one store write for all NPCs)
    if (results.batchUpdates && Object.keys(results.batchUpdates).length > 0) {
      store.batchUpdateSettlementNPCs(results.batchUpdates);
    }

    // 5. NPC removals
    if (results.removeIds) {
      for (const id of results.removeIds) {
        store.removeSettlementNPC(id);
      }
    }

    // 6. Notifications
    if (results.notifications && window.addNotification) {
      for (const n of results.notifications) {
        window.addNotification(n);
      }
    }

    // 7. Needs tick timestamp
    if (results.needsTicked) {
      store.updateSettlementTimestamps({ lastNeedsUpdate: Date.now() });
    }
  }
}

export default SettlementBridge;
