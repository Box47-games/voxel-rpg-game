/**
 * Test doubles for the settlement engine's two ports: the chunk adapter
 * (blocks) and the host (stockpiles, inventory, construction).
 */

import { BlockTypes } from '../../../../systems/chunks/blockTypes';
import { CHUNK_SIZE, CHUNK_SIZE_Y } from '../../../../systems/chunks/coordinates';

/** A sparse block world addressed by world coordinates. Unset blocks are AIR. */
export function makeFakeChunkManager(chunks = []) {
  const blocks = new Map();
  const key = (x, y, z) => `${x},${y},${z}`;
  return {
    chunks: new Map(chunks.map((c, i) => [`${c.x},${c.z},${i}`, c])),
    getBlock: (x, y, z) => blocks.get(key(x, y, z)) ?? BlockTypes.AIR,
    setBlock: vi.fn((x, y, z, type) => {
      blocks.set(key(x, y, z), type);
    }),
    /** Place a block without counting as a setBlock call. */
    place: (x, y, z, type) => {
      blocks.set(key(x, y, z), type);
    },
  };
}

/** Chunk adapter over a fake chunk manager, shaped like SettlementBridge's. */
export function makeChunkAdapter(chunkManager) {
  return {
    iterateChunks: () => chunkManager.chunks.values(),
    getBlock: (x, y, z) => chunkManager.getBlock(x, y, z),
    setBlock: (x, y, z, type) => chunkManager.setBlock(x, y, z, type),
    getRawChunkManager: () => chunkManager,
  };
}

/** An empty chunk's block array, optionally with one block set at local (x, y, z). */
export function makeChunkBlocks(at = null, type = BlockTypes.CAMPFIRE) {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y);
  if (at) blocks[at[0] + (at[2] << 4) + (at[1] << 8)] = type;
  return blocks;
}

/**
 * A host that behaves like the store's zone/inventory/construction actions.
 * State is replaced immutably, as in the store, so tick-start snapshots stay stale.
 */
export function makeFakeHost({ zones = [], constructionSites = [], materials = {} } = {}) {
  const state = { zones, constructionSites, materials: { ...materials } };

  const host = {
    state,
    getZones: () => state.zones,
    getConstructionSites: () => state.constructionSites,

    consumeFromStockpile: vi.fn((zoneId, material, amount) => {
      state.zones = state.zones.map((z) => {
        if (z.id !== zoneId || !z.storage) return z;
        const stored = z.storage.items[material] || 0;
        const toConsume = Math.min(amount, stored);
        if (toConsume <= 0) return z;
        const items = { ...z.storage.items, [material]: stored - toConsume };
        if (items[material] <= 0) delete items[material];
        return {
          ...z,
          storage: { ...z.storage, items, usedCapacity: Math.max(0, z.storage.usedCapacity - toConsume) },
        };
      });
    }),

    updateZone: vi.fn((zoneId, updates) => {
      state.zones = state.zones.map((z) => (z.id === zoneId ? { ...z, ...updates } : z));
    }),

    addMaterial: vi.fn((material, amount) => {
      state.materials = { ...state.materials, [material]: (state.materials[material] || 0) + amount };
    }),

    removeMaterial: vi.fn((material, amount) => {
      state.materials = {
        ...state.materials,
        [material]: Math.max(0, (state.materials[material] || 0) - amount),
      };
    }),

    npcDeliverToConstruction: vi.fn((siteId, material, amount) => {
      state.constructionSites = state.constructionSites.map((s) => {
        if (s.id !== siteId) return s;
        const materialsDelivered = {
          ...s.materialsDelivered,
          [material]: (s.materialsDelivered[material] || 0) + amount,
        };
        const allMet = Object.entries(s.materialsRequired)
          .every(([mat, req]) => (materialsDelivered[mat] || 0) >= req);
        return { ...s, materialsDelivered, status: allMet ? 'BUILDING' : s.status };
      });
    }),

    advanceConstruction: vi.fn((siteId) => {
      state.constructionSites = state.constructionSites.map((s) => {
        if (s.id !== siteId || s.status !== 'BUILDING') return s;
        const blocksPlaced = s.blocksPlaced + 1;
        return { ...s, blocksPlaced, status: blocksPlaced >= s.totalBlocks ? 'COMPLETE' : 'BUILDING' };
      });
    }),

    addPickupText: vi.fn(),
  };
  return host;
}

export function makeNPC(overrides = {}) {
  return {
    id: 'npc_1',
    fullName: 'Test Settler',
    personality: 'stoic',
    position: [50, 2, 50],
    targetPosition: null,
    facingAngle: 0,
    state: 'IDLE',
    stateTimer: 0,
    hunger: 80,
    rest: 80,
    social: 80,
    happiness: 65,
    unhappyDays: 0,
    dayCheckpoint: 0,
    currentJob: null,
    arrivedAtSettlement: true,
    eatingRestore: 0,
    _hungryWarned: false,
    skills: { mining: 0.5, gathering: 0.5, building: 0.5 },
    ...overrides,
  };
}

export function makeStockpile(overrides = {}) {
  return {
    id: 'stock_1',
    type: 'STOCKPILE',
    bounds: { minX: 40, minZ: 40, maxX: 48, maxZ: 48 },
    miningTasks: null,
    storage: { items: {}, capacity: 100, usedCapacity: 0 },
    ...overrides,
  };
}

export function makeSite(overrides = {}) {
  const materialsRequired = overrides.materialsRequired || { wood: 4 };
  return {
    id: 'site_1',
    buildingId: 'shelter',
    position: [60, 2, 60],
    status: 'PLACED',
    materialsRequired,
    // A site being built has its materials in (sites pay as they build)
    materialsDelivered: overrides.status === 'BUILDING' ? { ...materialsRequired } : {},
    blocksPlaced: 0,
    totalBlocks: 2,
    ...overrides,
  };
}

/** Tick context over a fake host; `zones`/`constructionSites` are the tick-start snapshot. */
export function makeContext(overrides = {}) {
  const chunkManager = overrides.chunkManager || makeFakeChunkManager();
  const host = overrides.host || makeFakeHost({
    zones: overrides.zones,
    constructionSites: overrides.constructionSites,
    materials: (overrides.inventory || { materials: { meat: 5, berry: 10 } }).materials,
  });
  const ctx = {
    center: [50, 2, 50],
    attractiveness: 30,
    npcs: [],
    zones: host.getZones(),
    constructionSites: host.getConstructionSites(),
    inventory: { materials: { meat: 5, berry: 10 } },
    worldTimeElapsed: 100,
    warnedNPCs: new Set(),
    chunkAdapter: makeChunkAdapter(chunkManager),
    host,
    ...overrides,
  };
  delete ctx.chunkManager;
  return ctx;
}
