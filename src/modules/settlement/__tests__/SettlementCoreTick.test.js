/**
 * SettlementCoreTick.test.js — SettlementModule.tickSettlementCore(), the live
 * per-frame settlement simulation, run headless against a fake world.
 */

import SettlementModule from '../SettlementModule';
import { getHomes } from '../housing';
import { clearTasks, findBestTask, getTask } from '../../../systems/settlement/TaskAssignmentEngine';
import { scanMiningZone } from '../../../systems/settlement/MiningZoneScanner';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import {
  SETTLEMENT_CAMPFIRE_SCAN_INTERVAL,
  ATTRACT_RECALC_INTERVAL,
  ATTRACT_CAMPFIRE_SCORE,
  ATTRACT_STOCKPILE_FOOD_SCORE,
  ATTRACT_RIFT_PENALTY,
  IMMIGRATION_CHECK_INTERVAL,
  IMMIGRATION_THRESHOLD,
  IMMIGRATION_THRESHOLD_PER_NPC,
  IMMIGRATION_SPAWN_MIN_DIST,
  IMMIGRATION_SPAWN_MAX_DIST,
  IMMIGRATION_MAX_NPCS,
  HOUSING_FREE_SETTLERS,
  DAY_LENGTH_SECONDS,
  HOUSING_HOMELESS_HAPPINESS_PENALTY,
  NPC_NEEDS_TICK_INTERVAL,
  NPC_HUNGER_DECAY_RATE,
  NPC_LEAVING_TIMEOUT,
  NPC_MINE_DURATION,
  WORK_SCAN_INTERVAL,
} from '../../../data/tuning';
import {
  makeFakeChunkManager,
  makeChunkAdapter,
  makeChunkBlocks,
  makeFakeHost,
  makeNPC,
  makeStockpile,
} from './helpers/fakeWorld';

const CENTER = [5, 11, 7]; // world position of a campfire at local (2, 5, 3) in chunk (0, 0)

// Placing a block marks its chunk modified; untouched terrain has lastModified 0.
function campfireChunk() {
  return { x: 0, z: 0, blocks: makeChunkBlocks([2, 5, 3]), lastModified: 1 };
}

function emptyChunk(x) {
  return { x, z: 0, blocks: makeChunkBlocks(), lastModified: 0 };
}

/**
 * A headless game: the module, a fake world, and a stand-in for the bridge
 * that feeds the module the current state and applies its results.
 */
const MORNING_SHIFT = 0.4 * DAY_LENGTH_SECONDS;

function makeGame({ chunks = [campfireChunk()], settlement = {}, zones = [], constructionSites = [], materials = {}, rifts = [] } = {}) {
  const chunkManager = makeFakeChunkManager(chunks);
  const host = makeFakeHost({ zones, constructionSites, materials });
  const module = new SettlementModule();
  module.initialize();
  module.setChunkAdapter(makeChunkAdapter(chunkManager));
  module.setHost(host);

  const state = {
    settlement: { npcs: [], attractiveness: 0, settlementCenter: null, ...settlement },
    zones: host.getZones(),
    constructionSites: host.getConstructionSites(),
    inventory: { materials: host.state.materials },
    rifts,
    // Morning shift, so settlers work by default (see schedule.js)
    worldTime: { elapsed: MORNING_SHIFT },
  };
  const notifications = [];

  /** One frame. Returns a copy of the (reused) results object. */
  function tick(delta) {
    state.zones = host.getZones();
    state.constructionSites = host.getConstructionSites();
    state.inventory = { materials: host.state.materials };

    const results = module.tickSettlementCore(delta, state);
    if (!results) return results;
    const snapshot = { ...results };

    const s = { ...state.settlement };
    if (results.campfireCenter) {
      s.settlementCenter = results.campfireCenter;
    } else {
      if (results.attractivenessUpdated) {
        s.attractiveness = results.attractiveness;
      }
      if (results.newNPC) s.npcs = [...s.npcs, results.newNPC];
      if (results.batchUpdates) {
        s.npcs = s.npcs.map((n) => (results.batchUpdates[n.id] ? { ...n, ...results.batchUpdates[n.id] } : n));
      }
      if (results.removeIds) s.npcs = s.npcs.filter((n) => !results.removeIds.includes(n.id));
      if (results.notifications) notifications.push(...results.notifications);
    }
    state.settlement = s;
    return snapshot;
  }

  return { module, host, chunkManager, state, tick, notifications };
}

beforeEach(() => {
  clearTasks();
});

describe('readiness', () => {
  test('returns null until initialized and given both ports', () => {
    const state = { settlement: { npcs: [], settlementCenter: null }, worldTime: { elapsed: 0 } };
    const module = new SettlementModule();
    expect(module.tickSettlementCore(1, state)).toBeNull();

    module.initialize();
    expect(module.tickSettlementCore(1, state)).toBeNull();

    module.setChunkAdapter(makeChunkAdapter(makeFakeChunkManager()));
    expect(module.tickSettlementCore(1, state)).toBeNull();

    module.setHost(makeFakeHost());
    expect(module.tickSettlementCore(1, state)).not.toBeNull();
  });

  test('returns null when there is no settlement state', () => {
    const { module } = makeGame();
    expect(module.tickSettlementCore(1, { settlement: null })).toBeNull();
  });
});

describe('campfire detection', () => {
  test('does not scan before the scan interval', () => {
    const { tick } = makeGame();
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL - 0.1).campfireCenter).toBeNull();
  });

  test('finds the campfire and reports its world position', () => {
    const { tick, state } = makeGame();
    const results = tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);
    expect(results.campfireCenter).toEqual(CENTER);
    expect(state.settlement.settlementCenter).toEqual(CENTER);
  });

  test('finds a campfire in one scan however many chunks are loaded', () => {
    const chunks = Array.from({ length: 200 }, (_, i) => emptyChunk(i + 1));
    chunks.push(campfireChunk());
    const { tick } = makeGame({ chunks });
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toEqual(CENTER);
  });

  test('skips chunks the player has not edited', () => {
    const natural = { ...campfireChunk(), lastModified: 0 };
    const { tick } = makeGame({ chunks: [natural] });
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toBeNull();
  });

  test('rescans a chunk when it is edited again (a campfire placed later is found)', () => {
    const first = { ...emptyChunk(0), lastModified: 1 };
    const { tick } = makeGame({ chunks: [first, emptyChunk(1)] });
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toBeNull();
    first.blocks = makeChunkBlocks([2, 5, 3]);
    // Unchanged since the last scan: not scanned again
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toBeNull();
    first.lastModified = 2;
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toEqual(CENTER);
  });

  test('copes with no loaded chunks', () => {
    const { tick } = makeGame({ chunks: [] });
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toBeNull();
    expect(tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL).campfireCenter).toBeNull();
  });

  test('nothing else runs until there is a center', () => {
    const npc = makeNPC({ hunger: 50 });
    const { tick } = makeGame({ chunks: [emptyChunk(0)], settlement: { npcs: [npc], attractiveness: 999 } });
    const results = tick(IMMIGRATION_CHECK_INTERVAL + 1);
    expect(results.attractivenessUpdated).toBe(false);
    expect(results.newNPC).toBeNull();
    expect(results.batchUpdates).toBeNull();
    expect(results.needsTicked).toBe(false);
  });

  test('the store owns the center: when it is cleared (new game) the engine goes back to scanning', () => {
    const { tick, state, module } = makeGame();
    tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);
    module._warnedNPCs.add('npc_old');

    state.settlement = { npcs: [], attractiveness: 0, settlementCenter: null };
    const results = tick(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);

    expect(results.campfireCenter).toEqual(CENTER);
    expect(module._warnedNPCs.size).toBe(0);
  });

  test('a center that comes from a loaded save is used without rescanning', () => {
    const { tick } = makeGame({ chunks: [emptyChunk(0)], settlement: { settlementCenter: [100, 3, 100] } });
    const results = tick(ATTRACT_RECALC_INTERVAL);
    expect(results.campfireCenter).toBeNull();
    expect(results.attractivenessUpdated).toBe(true);
  });
});

describe('attractiveness', () => {
  test('recalculates on its interval from the loaded chunks', () => {
    const { tick, state } = makeGame({ settlement: { settlementCenter: CENTER } });

    expect(tick(ATTRACT_RECALC_INTERVAL - 0.5).attractivenessUpdated).toBe(false);
    const results = tick(0.5);

    expect(results.attractivenessUpdated).toBe(true);
    expect(results.attractiveness).toBe(ATTRACT_CAMPFIRE_SCORE);
    expect(state.settlement.attractiveness).toBe(ATTRACT_CAMPFIRE_SCORE);
  });

  test('counts stockpiled food and nearby rifts (needs zones and rifts from the game state)', () => {
    const stockpile = makeStockpile({ storage: { items: { berry: 2 }, capacity: 100, usedCapacity: 2 } });
    const { tick } = makeGame({
      settlement: { settlementCenter: CENTER },
      zones: [stockpile],
      rifts: [{ x: CENTER[0] + 10, z: CENTER[2] }],
    });

    const results = tick(ATTRACT_RECALC_INTERVAL);

    expect(results.attractiveness).toBe(
      ATTRACT_CAMPFIRE_SCORE + 2 * ATTRACT_STOCKPILE_FOOD_SCORE + ATTRACT_RIFT_PENALTY
    );
  });
});

/** Completed Wooden Shelters: one bed each. */
function shelters(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `home${i}`, buildingId: 'wooden_shelter', position: [i * 20, 2, 40], status: 'COMPLETE',
  }));
}

describe('immigration', () => {
  const ATTRACTIVE = { settlementCenter: CENTER, attractiveness: IMMIGRATION_THRESHOLD };

  test('spawns an approaching NPC when the settlement is attractive enough', () => {
    const { tick, state } = makeGame({ settlement: ATTRACTIVE });
    state.worldTime.elapsed = 777;

    expect(tick(IMMIGRATION_CHECK_INTERVAL - 1).newNPC).toBeNull();
    const npc = tick(1).newNPC;

    expect(npc).toMatchObject({
      targetPosition: CENTER,
      facingAngle: 0,
      state: 'APPROACHING',
      stateTimer: 0,
      hunger: 80,
      rest: 80,
      social: 80,
      happiness: 65,
      unhappyDays: 0,
      dayCheckpoint: 777,
      currentJob: null,
      arrivedAtSettlement: false,
    });
    expect(npc.id).toMatch(/^npc_\d+_1$/);
    expect(typeof npc.fullName).toBe('string');
    expect(npc.skills).toBeDefined();
    expect(npc.targetPosition).not.toBe(CENTER); // its own copy

    const dist = Math.hypot(npc.position[0] - CENTER[0], npc.position[2] - CENTER[2]);
    expect(dist).toBeGreaterThanOrEqual(IMMIGRATION_SPAWN_MIN_DIST);
    expect(dist).toBeLessThanOrEqual(IMMIGRATION_SPAWN_MAX_DIST);
    expect(npc.position[1]).toBe(2); // no terrain in the fake world → fallback height
  });

  test('spawns on top of the terrain', () => {
    const { tick, chunkManager } = makeGame({ settlement: ATTRACTIVE });
    chunkManager.getBlock = (x, y) => (y === 9 ? BlockTypes.STONE : BlockTypes.AIR);
    expect(tick(IMMIGRATION_CHECK_INTERVAL).newNPC.position[1]).toBe(10);
  });

  test('does not spawn below the threshold, which rises with population', () => {
    const one = makeNPC({ state: 'APPROACHING', targetPosition: CENTER });
    const needed = IMMIGRATION_THRESHOLD + IMMIGRATION_THRESHOLD_PER_NPC;

    const constructionSites = shelters(2);
    const tooLow = makeGame({ settlement: { ...ATTRACTIVE, npcs: [one], attractiveness: needed - 1 }, constructionSites });
    expect(tooLow.tick(IMMIGRATION_CHECK_INTERVAL).newNPC).toBeNull();

    const enough = makeGame({ settlement: { ...ATTRACTIVE, npcs: [one], attractiveness: needed }, constructionSites: shelters(2) });
    expect(enough.tick(IMMIGRATION_CHECK_INTERVAL).newNPC).not.toBeNull();
  });

  test('uses the attractiveness from before this frame, not the value recalculated in it', () => {
    // The chunk scan will produce ATTRACT_CAMPFIRE_SCORE (>= threshold) on this
    // very frame, but the settlement still shows 0 from before.
    const { tick } = makeGame({ settlement: { ...ATTRACTIVE, attractiveness: 0 } });

    const results = tick(IMMIGRATION_CHECK_INTERVAL);

    expect(results.attractivenessUpdated).toBe(true);
    expect(results.attractiveness).toBeGreaterThanOrEqual(IMMIGRATION_THRESHOLD);
    expect(results.newNPC).toBeNull();
  });

  test('population is capped by beds, with a free pioneer and a ceiling', () => {
    const crowd = (n) => Array.from({ length: n }, (_, i) =>
      makeNPC({ id: `n${i}`, state: 'APPROACHING', targetPosition: CENTER }));
    const veryAttractive = { ...ATTRACTIVE, attractiveness: 10000 };
    const spawns = (npcCount, constructionSites) =>
      makeGame({ settlement: { ...veryAttractive, npcs: crowd(npcCount) }, constructionSites })
        .tick(IMMIGRATION_CHECK_INTERVAL).newNPC !== null;

    // The pioneer joins without a bed; nobody else does
    expect(spawns(0, [])).toBe(true);
    expect(spawns(HOUSING_FREE_SETTLERS, [])).toBe(false);
    // One bed per settler: two shelters take the second settler, not a third
    expect(spawns(1, shelters(2))).toBe(true);
    expect(spawns(2, shelters(2))).toBe(false);
    // Unfinished buildings and buildings without beds don't count
    expect(spawns(1, [{ ...shelters(1)[0], status: 'BUILDING' }, { ...shelters(1)[0], id: 'tower', buildingId: 'watchtower' }])).toBe(false);
    // Hard ceiling
    expect(spawns(IMMIGRATION_MAX_NPCS, shelters(IMMIGRATION_MAX_NPCS + 5))).toBe(false);
  });

  test('each immigrant gets a distinct id', () => {
    const { tick, state } = makeGame({ settlement: ATTRACTIVE, constructionSites: shelters(2) });
    const first = tick(IMMIGRATION_CHECK_INTERVAL).newNPC;
    state.settlement = { ...state.settlement, attractiveness: 10000 };
    const second = tick(IMMIGRATION_CHECK_INTERVAL).newNPC;
    expect(second).not.toBeNull();
    expect(second.id).not.toBe(first.id);
  });
});

describe('NPC tick', () => {
  const SETTLED = { settlementCenter: CENTER, attractiveness: 50 };

  test('runs on the needs interval with the time that actually accumulated', () => {
    const npc = makeNPC({ hunger: 50, state: 'SOCIALIZING' });
    const { tick, state } = makeGame({ settlement: { ...SETTLED, npcs: [npc] } });

    expect(tick(NPC_NEEDS_TICK_INTERVAL * 0.75).needsTicked).toBe(false);
    const results = tick(NPC_NEEDS_TICK_INTERVAL * 0.75);

    expect(results.needsTicked).toBe(true);
    expect(state.settlement.npcs[0].hunger)
      .toBeCloseTo(50 - NPC_HUNGER_DECAY_RATE * NPC_NEEDS_TICK_INTERVAL * 1.5, 10);
    expect(tick(NPC_NEEDS_TICK_INTERVAL * 0.5).needsTicked).toBe(false);
  });

  test('every NPC gets an entry in the batch; expired leavers are removed instead', () => {
    const npcs = [
      makeNPC({ id: 'a', state: 'SOCIALIZING' }),
      makeNPC({ id: 'b', state: 'APPROACHING', targetPosition: CENTER }),
      makeNPC({ id: 'c', state: 'LEAVING', stateTimer: NPC_LEAVING_TIMEOUT, targetPosition: [500, 0, 500] }),
    ];
    const { tick, state } = makeGame({ settlement: { ...SETTLED, npcs } });

    const results = tick(NPC_NEEDS_TICK_INTERVAL);

    expect(Object.keys(results.batchUpdates).sort()).toEqual(['a', 'b']);
    expect(results.removeIds).toEqual(['c']);
    expect(state.settlement.npcs.map((n) => n.id)).toEqual(['a', 'b']);
  });

  test('collects notifications from all NPCs', () => {
    const npcs = [
      makeNPC({ id: 'a', fullName: 'Ada', state: 'EVALUATING', stateTimer: 100 }),
      makeNPC({ id: 'b', fullName: 'Bo', state: 'IDLE', hunger: 1 }),
    ];
    const { tick, notifications } = makeGame({ settlement: { ...SETTLED, npcs } });

    tick(NPC_NEEDS_TICK_INTERVAL);

    expect(notifications.map((n) => n.title)).toEqual(['New Settler!', 'No Food']);
  });

  test('an evaluating NPC is judged on the attractiveness from before this frame', () => {
    const npc = makeNPC({ state: 'EVALUATING', stateTimer: 100 });
    // Chunk scan says 20 on this frame; the settlement still shows 0.
    const { tick, state } = makeGame({ settlement: { settlementCenter: CENTER, attractiveness: 0, npcs: [npc] } });

    tick(ATTRACT_RECALC_INTERVAL);

    expect(state.settlement.attractiveness).toBeGreaterThanOrEqual(IMMIGRATION_THRESHOLD);
    expect(state.settlement.npcs[0].state).toBe('LEAVING');
  });

  test('hungry NPCs eat through the host (stockpile first)', () => {
    const stockpile = makeStockpile({ storage: { items: { meat: 1 }, capacity: 100, usedCapacity: 1 } });
    const npc = makeNPC({ hunger: 1 });
    const { tick, state, host } = makeGame({
      settlement: { ...SETTLED, npcs: [npc] },
      zones: [stockpile],
      materials: { berry: 5 },
    });

    tick(NPC_NEEDS_TICK_INTERVAL);

    expect(state.settlement.npcs[0].state).toBe('EATING');
    expect(host.getZones()[0].storage.items).toEqual({});
    expect(host.state.materials.berry).toBe(5);
  });

  test('the reused results object carries nothing over to the next frame', () => {
    const npc = makeNPC({ state: 'SOCIALIZING' });
    const { module, state } = makeGame({ settlement: { ...SETTLED, attractiveness: 0, npcs: [npc] } });

    const first = module.tickSettlementCore(IMMIGRATION_CHECK_INTERVAL, state);
    expect(first.needsTicked).toBe(true);
    expect(first.attractivenessUpdated).toBe(true);

    const second = module.tickSettlementCore(0.016, state);
    expect(second).toBe(first);
    expect(second).toMatchObject({
      campfireCenter: null,
      attractivenessUpdated: false,
      newNPC: null,
      batchUpdates: null,
      removeIds: null,
      notifications: null,
      needsTicked: false,
    });
  });
});

describe('work loop', () => {
  // A mining zone one step from the NPC, stone on the surface and underneath.
  function miningGame(extra = {}) {
    const game = makeGame({ settlement: { settlementCenter: CENTER, attractiveness: 50 }, ...extra });
    game.chunkManager.place(101, 5, 101, BlockTypes.STONE);
    game.chunkManager.place(101, 3, 101, BlockTypes.STONE);
    const bounds = { minX: 100, minZ: 100, maxX: 102, maxZ: 102 };
    const zone = { id: 'mine_1', type: 'MINING', bounds, storage: null, miningTasks: scanMiningZone(bounds, game.chunkManager) };
    game.host.state.zones = [...game.host.state.zones, zone];
    const npc = makeNPC({ position: [101, 6, 102], skills: { mining: 1.0 } });
    game.state.settlement = { ...game.state.settlement, npcs: [npc] };
    return game;
  }
  const npcOf = (game) => game.state.settlement.npcs[0];

  test('tasks appear after the work scan interval', () => {
    const game = miningGame();
    game.tick(WORK_SCAN_INTERVAL - 1);
    expect(findBestTask(npcOf(game))).toBeNull();
    game.tick(1);
    expect(findBestTask(npcOf(game))).toMatchObject({ type: 'MINE', position: [101, 5, 101] });
  });

  test('an idle NPC picks up a task, mines the block and banks the drop', () => {
    const game = miningGame();

    game.tick(WORK_SCAN_INTERVAL); // scan + needs tick → claims the task
    expect(npcOf(game)).toMatchObject({ state: 'WORKING_MINE', targetPosition: [101, 5, 101] });

    // Mining at skill 1.0 takes NPC_MINE_DURATION seconds of needs ticks
    for (let t = 0; t < NPC_MINE_DURATION; t += NPC_NEEDS_TICK_INTERVAL) {
      expect(game.chunkManager.setBlock).not.toHaveBeenCalled();
      game.tick(NPC_NEEDS_TICK_INTERVAL);
    }

    expect(game.chunkManager.setBlock).toHaveBeenCalledWith(101, 5, 101, BlockTypes.AIR);
    expect(game.host.state.materials.stone_slab).toBeGreaterThanOrEqual(1); // stone breaks into slabs
    expect(npcOf(game)).toMatchObject({ state: 'IDLE', currentTaskId: null, workTimer: 0 });
    expect(npcOf(game).skills.mining).toBe(1.0); // capped
  });

  test('completing a task rescans straight away, so the newly exposed block is available next tick', () => {
    const game = miningGame();
    game.tick(WORK_SCAN_INTERVAL);
    for (let t = 0; t < NPC_MINE_DURATION; t += NPC_NEEDS_TICK_INTERVAL) game.tick(NPC_NEEDS_TICK_INTERVAL);
    expect(npcOf(game).state).toBe('IDLE');

    // No waiting for WORK_SCAN_INTERVAL: the very next needs tick claims the block below
    game.tick(NPC_NEEDS_TICK_INTERVAL);

    expect(npcOf(game)).toMatchObject({ state: 'WORKING_MINE', targetPosition: [101, 3, 101] });
    expect(getTask(npcOf(game).currentTaskId).claimedBy).toBe('npc_1');
  });

  test('the periodic scan keeps existing claims', () => {
    const game = miningGame();
    game.tick(WORK_SCAN_INTERVAL);
    const taskId = npcOf(game).currentTaskId;
    game.state.settlement = { ...game.state.settlement, npcs: [{ ...npcOf(game), position: [200, 6, 200] }] };

    game.tick(WORK_SCAN_INTERVAL); // rescan while the NPC is still walking

    expect(getTask(taskId)).toMatchObject({ claimedBy: 'npc_1' });
    expect(npcOf(game).currentTaskId).toBe(taskId);
  });
});

describe('housing', () => {
  const SETTLED = { settlementCenter: CENTER, attractiveness: 50 };
  const tickNeeds = (npcs, constructionSites) =>
    makeGame({ settlement: { ...SETTLED, npcs }, constructionSites }).tick(NPC_NEEDS_TICK_INTERVAL).batchUpdates;

  test('a completed shelter houses one settler; the next one stays homeless', () => {
    const updates = tickNeeds(
      [makeNPC({ id: 'a', state: 'SOCIALIZING' }), makeNPC({ id: 'b', state: 'SOCIALIZING' })],
      shelters(1)
    );
    expect(updates.a.homeId).toBe('home0');
    expect(updates.b.homeId).toBeUndefined(); // unchanged: still homeless
  });

  test('homeless settlers are less happy', () => {
    const same = { state: 'SOCIALIZING', hunger: 60, rest: 60, social: 60, personality: 'stoic' };
    const updates = tickNeeds([makeNPC({ ...same, id: 'a' }), makeNPC({ ...same, id: 'b' })], shelters(1));
    expect(updates.b.happiness - updates.a.happiness).toBeCloseTo(HOUSING_HOMELESS_HAPPINESS_PENALTY);
  });

  test('a tired settler walks to its home to sleep', () => {
    const updates = tickNeeds([makeNPC({ id: 'a', state: 'IDLE', hunger: 90, rest: 1 })], shelters(1));
    expect(updates.a.state).toBe('SLEEPING');
    expect(updates.a.targetPosition).toEqual(getHomes(shelters(1))[0].sleepPosition);
  });

  test('settlers lose their home when the building is gone', () => {
    const updates = tickNeeds([makeNPC({ id: 'a', state: 'SOCIALIZING', homeId: 'home0' })], []);
    expect(updates.a.homeId).toBeNull();
  });
});
