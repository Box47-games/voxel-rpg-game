/**
 * NPCWorkBehavior.test.js — The NPC work loop: finding work, mining, hauling,
 * building, and the needs interrupts that pause and resume a task.
 *
 * Driven through tickNPC, the same way the live tick drives it.
 */

import { parseLayers, getBuildingById } from '../../../data/buildings';
import { SCAFFOLD_REACH_LEVELS } from '../../../data/tuning';
import { VOXEL_SIZE } from '../../../systems/chunks/coordinates';
import {
  getScaffoldRoute,
  projectOnRoute,
  pointOnRoute,
  alongAtHeight,
  getGroundRing,
  pointOnRing,
} from '../../../systems/construction/scaffoldRoute';
import { tickNPC } from '../NPCStateMachine';
import { getNextBlock } from '../buildingInfo';
import {
  scanForTasks,
  clearTasks,
  getTask,
  findBestTask,
  claimTask,
  siteHasNPCBuilder,
} from '../../../systems/settlement/TaskAssignmentEngine';
import { scanMiningZone } from '../../../systems/settlement/MiningZoneScanner';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import {
  NPC_MINE_DURATION,
  NPC_BUILD_DURATION,
  NPC_SKILL_GROWTH,
  NPC_THOUGHT_DURATION,
  HOUSING_CAMPFIRE_SLEEP_RADIUS,
  DAY_LENGTH_SECONDS,
  NPC_LEAVE_DEPARTURE_DAYS,
} from '../../../data/tuning';
import {
  makeFakeChunkManager,
  makeFakeHost,
  makeNPC,
  makeContext,
  makeStockpile,
  makeSite,
} from './helpers/fakeWorld';

// A 2x1-voxel mining zone with stone at the surface of the first column and
// more stone underneath it.
const MINE_POS = [101, 5, 101];
const BELOW_POS = [101, 3, 101];

function makeMiningWorld() {
  const chunkManager = makeFakeChunkManager();
  chunkManager.place(...MINE_POS, BlockTypes.STONE);
  chunkManager.place(...BELOW_POS, BlockTypes.STONE);
  const bounds = { minX: 100, minZ: 100, maxX: 104, maxZ: 102 };
  const zone = {
    id: 'mine_1',
    type: 'MINING',
    bounds,
    storage: null,
    miningTasks: scanMiningZone(bounds, chunkManager),
  };
  return { chunkManager, zone };
}

/** Build a context and publish its zones/sites as tasks. */
function setup({ zones = [], constructionSites = [], chunkManager = makeFakeChunkManager(), ...rest } = {}) {
  const host = makeFakeHost({ zones, constructionSites, materials: rest.inventory?.materials || {} });
  const ctx = makeContext({ host, chunkManager, inventory: { materials: {} }, ...rest });
  scanForTasks(zones, constructionSites, chunkManager);
  return ctx;
}

/** Put an NPC to work on the best task, returning the NPC as it would be after the tick. */
function startWork(npc, ctx) {
  const { updates } = tickNPC(npc, 2, ctx);
  return { ...npc, ...updates };
}

beforeEach(() => {
  clearTasks();
});

// ── Finding work ─────────────────────────────────────────────

describe('IDLE → work', () => {
  test('claims a mining task and walks to it', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = makeNPC();

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.state).toBe('WORKING_MINE');
    expect(updates.stateTimer).toBe(0);
    expect(updates.workTimer).toBe(0);
    expect(updates.targetPosition).toEqual(MINE_POS);
    expect(updates.thoughtBubble).toEqual({ type: 'mining', timer: NPC_THOUGHT_DURATION });
    expect(getTask(updates.currentTaskId).claimedBy).toBe('npc_1');
  });

  test('a haul task starts in the pickup phase, heading for the stockpile', () => {
    const stockpile = makeStockpile({ storage: { items: { wood: 10 }, capacity: 100, usedCapacity: 10 } });
    const ctx = setup({ zones: [stockpile], constructionSites: [makeSite()] });

    const { updates } = tickNPC(makeNPC(), 2, ctx);

    expect(updates.state).toBe('WORKING_HAUL');
    expect(updates.haulPhase).toBe('pickup');
    expect(updates.carryingItem).toBeNull();
    expect(updates.targetPosition).toEqual([44, 2, 44]); // stockpile centre, at site height
    expect(updates.thoughtBubble.type).toBe('hauling');
  });

  test('a build task is taken for a site that is ready to build', () => {
    const ctx = setup({ constructionSites: [makeSite({ status: 'BUILDING' })] });

    const { updates } = tickNPC(makeNPC(), 2, ctx);

    expect(updates.state).toBe('WORKING_BUILD');
    expect(updates.targetPosition).toEqual([60, 2, 60]);
    expect(updates.thoughtBubble.type).toBe('building');
    expect(siteHasNPCBuilder('site_1')).toBe(true);
  });

  test('two NPCs do not claim the same task', () => {
    const { chunkManager, zone } = makeMiningWorld();
    zone.miningTasks = zone.miningTasks.slice(0, 1);
    const ctx = setup({ zones: [zone], chunkManager });

    const first = tickNPC(makeNPC({ id: 'npc_1' }), 2, ctx).updates;
    const second = tickNPC(makeNPC({ id: 'npc_2' }), 2, ctx).updates;

    expect(first.state).toBe('WORKING_MINE');
    expect(second.state).toBeUndefined();
  });

  test('critical needs come before work', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });

    const { updates } = tickNPC(makeNPC({ rest: 5 }), 2, ctx);

    expect(updates.state).toBe('SLEEPING');
    expect(findBestTask(makeNPC())).not.toBeNull(); // nothing was claimed
  });

  test('work comes before wandering, and does not spend a random roll', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const random = vi.spyOn(Math, 'random');

    const { updates } = tickNPC(makeNPC({ stateTimer: 100 }), 2, ctx);

    expect(updates.state).toBe('WORKING_MINE');
    expect(random).not.toHaveBeenCalled();
  });
});

// ── Mining ───────────────────────────────────────────────────

describe('WORKING_MINE', () => {
  function miner(ctx, overrides = {}) {
    return { ...startWork(makeNPC(overrides), ctx) };
  }

  test('keeps walking while out of range, without working', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = miner(ctx);

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(updates.targetPosition).toEqual(MINE_POS);
    expect(updates.workTimer).toBeUndefined();
    expect(updates.state).toBeUndefined();
    expect(taskCompleted).toBe(false);
  });

  test('accumulates work time once in range', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 102] };

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.workTimer).toBe(2);
    expect(updates.state).toBeUndefined();
    expect(chunkManager.setBlock).not.toHaveBeenCalled();
  });

  test('mining duration scales with skill (duration / skill)', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    // Skill 1.0 → NPC_MINE_DURATION seconds; skill 0.5 would need twice that.
    const npc = { ...miner(ctx, { skills: { mining: 1.0 } }), position: [101, 6, 101], workTimer: NPC_MINE_DURATION - 1 };

    const { updates, taskCompleted } = tickNPC(npc, 1, ctx);

    expect(taskCompleted).toBe(true);
    expect(updates.state).toBe('IDLE');
  });

  test('finishing removes the block, grows the skill and returns to IDLE', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const working = miner(ctx);
    const taskId = working.currentTaskId;
    const npc = { ...working, position: [101, 6, 101], workTimer: NPC_MINE_DURATION / 0.5 - 1 };

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(chunkManager.setBlock).toHaveBeenCalledWith(...MINE_POS, BlockTypes.AIR);
    expect(taskCompleted).toBe(true);
    expect(getTask(taskId)).toBeNull();
    expect(updates).toMatchObject({
      state: 'IDLE',
      stateTimer: 0,
      currentTaskId: null,
      workTimer: 0,
      targetPosition: null,
    });
    expect(updates.skills.mining).toBeCloseTo(0.5 + NPC_SKILL_GROWTH, 10);
  });

  test('with no stockpile, drops go to the player inventory', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 101], workTimer: 100 };

    tickNPC(npc, 2, ctx);

    expect(ctx.host.addMaterial).toHaveBeenCalledWith('stone', 1);
  });

  test('a full (or zero-capacity) stockpile is skipped in favour of the inventory', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const stockpile = makeStockpile({ storage: { items: {}, capacity: 0, usedCapacity: 0 } });
    const ctx = setup({ zones: [zone, stockpile], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 101], workTimer: 100 };

    tickNPC(npc, 2, ctx);

    expect(ctx.host.addMaterial).toHaveBeenCalledWith('stone', 1);
    expect(ctx.host.getZones()[1].storage.items).toEqual({});
  });

  test('drops go into the first stockpile with free space', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const full = makeStockpile({ id: 'full', storage: { items: { dirt: 5 }, capacity: 5, usedCapacity: 5 } });
    const open = makeStockpile({ id: 'open' });
    const ctx = setup({ zones: [zone, full, open], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 101], workTimer: 100 };

    tickNPC(npc, 2, ctx);

    const zones = ctx.host.getZones();
    expect(zones.find((z) => z.id === 'open').storage).toMatchObject({ items: { stone: 1 }, usedCapacity: 1 });
    expect(zones.find((z) => z.id === 'full').storage.usedCapacity).toBe(5);
    expect(ctx.host.addMaterial).not.toHaveBeenCalled();
  });

  test('two miners finishing in the same tick both land in the stockpile', () => {
    const chunkManager = makeFakeChunkManager();
    chunkManager.place(101, 5, 101, BlockTypes.STONE);
    chunkManager.place(103, 5, 101, BlockTypes.STONE);
    const bounds = { minX: 100, minZ: 100, maxX: 104, maxZ: 102 };
    const zone = { id: 'mine_1', type: 'MINING', bounds, storage: null, miningTasks: scanMiningZone(bounds, chunkManager) };
    const ctx = setup({ zones: [zone, makeStockpile()], chunkManager });

    const a = { ...startWork(makeNPC({ id: 'a', position: [101, 6, 101] }), ctx), workTimer: 100 };
    const b = { ...startWork(makeNPC({ id: 'b', position: [103, 6, 101] }), ctx), workTimer: 100 };
    tickNPC(a, 2, ctx);
    tickNPC(b, 2, ctx);

    // ctx.zones is still the tick-start snapshot; the second deposit must build on the first.
    expect(ctx.host.getZones()[1].storage).toMatchObject({ items: { stone: 2 }, usedCapacity: 2 });
  });

  test('marks the zone task done and queues the block exposed underneath', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 101], workTimer: 100 };

    tickNPC(npc, 2, ctx);

    const tasks = ctx.host.getZones()[0].miningTasks;
    expect(tasks).toEqual([
      { wx: 101, wy: 5, wz: 101, blockType: BlockTypes.STONE, status: 'done' },
      { wx: 101, wy: 3, wz: 101, blockType: BlockTypes.STONE, status: 'pending' },
    ]);
  });

  test('a block that is already gone still completes the task, with no drops', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = { ...miner(ctx), position: [101, 6, 101], workTimer: 100 };
    chunkManager.place(...MINE_POS, BlockTypes.AIR); // the player mined it first

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(chunkManager.setBlock).not.toHaveBeenCalled();
    expect(ctx.host.addMaterial).not.toHaveBeenCalled();
    expect(taskCompleted).toBe(true);
    expect(updates.state).toBe('IDLE');
  });

  test('returns to IDLE if the task no longer exists', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager });
    const npc = miner(ctx);
    clearTasks();

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(updates).toMatchObject({ state: 'IDLE', stateTimer: 0, currentTaskId: null, workTimer: 0, targetPosition: null });
    expect(taskCompleted).toBe(false);
  });
});

// ── Hauling ──────────────────────────────────────────────────

describe('WORKING_HAUL', () => {
  function haulWorld(stored = 10) {
    const stockpile = makeStockpile({ storage: { items: { wood: stored }, capacity: 100, usedCapacity: stored } });
    return setup({ zones: [stockpile], constructionSites: [makeSite()] });
  }

  test('pickup: keeps walking to the stockpile while out of range', () => {
    const ctx = haulWorld();
    const npc = startWork(makeNPC(), ctx);

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.targetPosition).toEqual([44, 2, 44]);
    expect(ctx.host.consumeFromStockpile).not.toHaveBeenCalled();
  });

  test('pickup: takes what the site needs and heads for the site', () => {
    const ctx = haulWorld(10);
    const npc = { ...startWork(makeNPC(), ctx), position: [44, 2, 44] };

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(ctx.host.consumeFromStockpile).toHaveBeenCalledWith('stock_1', 'wood', 4);
    expect(updates.carryingItem).toEqual({ material: 'wood', amount: 4 });
    expect(updates.haulPhase).toBe('deliver');
    expect(updates.targetPosition).toEqual([60, 2, 60]);
    expect(taskCompleted).toBe(false);
  });

  test('pickup: takes only what is there when the stockpile is short', () => {
    const ctx = haulWorld(3);
    const npc = { ...startWork(makeNPC(), ctx), position: [44, 2, 44] };

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.carryingItem).toEqual({ material: 'wood', amount: 3 });
  });

  test('pickup: abandons the task when the material is gone', () => {
    const ctx = haulWorld(10);
    const working = { ...startWork(makeNPC(), ctx), position: [44, 2, 44] };
    // The player emptied the stockpile before this tick's snapshot.
    ctx.zones = [makeStockpile()];

    const { updates, taskCompleted } = tickNPC(working, 2, ctx);

    expect(taskCompleted).toBe(true);
    expect(getTask(working.currentTaskId)).toBeNull();
    expect(updates).toMatchObject({
      state: 'IDLE', stateTimer: 0, currentTaskId: null, carryingItem: null, haulPhase: null, targetPosition: null,
    });
  });

  test('deliver: keeps walking to the site while out of range', () => {
    const ctx = haulWorld();
    const npc = {
      ...startWork(makeNPC(), ctx),
      haulPhase: 'deliver',
      carryingItem: { material: 'wood', amount: 4 },
    };

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.targetPosition).toEqual([60, 2, 60]);
    expect(ctx.host.npcDeliverToConstruction).not.toHaveBeenCalled();
  });

  test('deliver: hands over the materials, grows gathering and returns to IDLE', () => {
    const ctx = haulWorld();
    const working = startWork(makeNPC(), ctx);
    const npc = {
      ...working,
      position: [60, 2, 61],
      haulPhase: 'deliver',
      carryingItem: { material: 'wood', amount: 4 },
    };

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(ctx.host.npcDeliverToConstruction).toHaveBeenCalledWith('site_1', 'wood', 4);
    expect(ctx.host.getConstructionSites()[0].status).toBe('BUILDING');
    expect(taskCompleted).toBe(true);
    expect(getTask(working.currentTaskId)).toBeNull();
    expect(updates).toMatchObject({
      state: 'IDLE', stateTimer: 0, currentTaskId: null, carryingItem: null, haulPhase: null, workTimer: 0, targetPosition: null,
    });
    expect(updates.skills.gathering).toBeCloseTo(0.5 + NPC_SKILL_GROWTH, 10);
  });

  test('returns to IDLE empty-handed if the task no longer exists', () => {
    const ctx = haulWorld();
    const npc = { ...startWork(makeNPC(), ctx), haulPhase: 'deliver', carryingItem: { material: 'wood', amount: 4 } };
    clearTasks();

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates).toMatchObject({ state: 'IDLE', currentTaskId: null, carryingItem: null, haulPhase: null, targetPosition: null });
  });
});

// ── Building ─────────────────────────────────────────────────

describe('WORKING_BUILD', () => {
  function buildWorld(siteOverrides = {}) {
    return setup({ constructionSites: [makeSite({ status: 'BUILDING', ...siteOverrides })] });
  }
  const AT_SITE = [60, 2, 61];
  const ALMOST = NPC_BUILD_DURATION / 0.5 - 1;

  test('keeps walking to the site while out of range', () => {
    const ctx = buildWorld();
    const npc = startWork(makeNPC(), ctx);

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.targetPosition).toEqual([60, 2, 60]);
    expect(updates.workTimer).toBeUndefined();
  });

  test('accumulates work time at the site', () => {
    const ctx = buildWorld();
    const npc = { ...startWork(makeNPC(), ctx), position: AT_SITE };

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.workTimer).toBe(2);
    expect(ctx.host.advanceConstruction).not.toHaveBeenCalled();
  });

  test('places a block when the work timer fills, and keeps building', () => {
    const ctx = buildWorld({ totalBlocks: 3 });
    const npc = { ...startWork(makeNPC(), ctx), position: AT_SITE, workTimer: ALMOST };

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(ctx.host.advanceConstruction).toHaveBeenCalledWith('site_1');
    expect(updates.workTimer).toBe(0);
    expect(updates.state).toBeUndefined();
    expect(taskCompleted).toBe(false);
    expect(ctx.host.addPickupText).not.toHaveBeenCalled();
  });

  // Where a builder stands for a site's next low block: on the ground ring beside it
  const standSpot = (site) => {
    const ring = getGroundRing(site);
    const next = getNextBlock(site);
    return pointOnRing(ring, projectOnRoute(ring, next.x, next.z).along);
  };

  test('puts the blueprint block in the world, not just the count', () => {
    const ctx = buildWorld({ buildingId: 'wooden_shelter', totalBlocks: 3 });
    ctx.chunkAdapter = { ...ctx.chunkAdapter, setBlock: vi.fn() };
    const npc = { ...startWork(makeNPC(), ctx), position: standSpot(ctx.constructionSites[0]), workTimer: ALMOST };

    tickNPC(npc, 2, ctx);

    const first = getNextBlock(ctx.constructionSites[0]);
    expect(ctx.chunkAdapter.setBlock).toHaveBeenCalledWith(first.x, first.y, first.z, first.blockType);
  });

  describe('high blocks: building from the scaffolding', () => {
    // wooden_shelter at [60, 2, 60]; skip ahead to its first block two levels up
    const highWorld = () => {
      const probe = { position: [60, 2, 60], buildingId: 'wooden_shelter' };
      const firstHigh = parseLayers(getBuildingById('wooden_shelter')).findIndex((b) => b.y >= SCAFFOLD_REACH_LEVELS);
      const ctx = buildWorld({ ...probe, blocksPlaced: firstHigh, totalBlocks: 99 });
      const route = getScaffoldRoute(ctx.constructionSites[0]);
      const next = getNextBlock(ctx.constructionSites[0]);
      return { ctx, route, goal: alongAtHeight(route, next.y - VOXEL_SIZE * 1.5) };
    };

    test('a settler on the ground walks round the outside to the foot of the ramp', () => {
      const { ctx } = highWorld();
      const ring = getGroundRing(ctx.constructionSites[0]);
      // Just past the first corner: the foot is behind them, the short way round
      const npc = { ...startWork(makeNPC(), ctx), position: pointOnRing(ring, ring.segments[1].start + 1) };
      const { updates } = tickNPC(npc, 2, ctx);
      const p = projectOnRoute(ring, updates.targetPosition[0], updates.targetPosition[2]);
      expect(p.off).toBeLessThan(0.01); // stays on the ring, outside the walls
      expect(p.along).toBeCloseTo(ring.segments[1].start, 5); // back to the corner first
      expect(updates.workTimer).toBeUndefined();
    });

    test('a settler up on the walls steps out to the ring first', () => {
      const { ctx } = highWorld();
      const ring = getGroundRing(ctx.constructionSites[0]);
      // On top of the front wall (the corner block), two levels up
      const npc = { ...startWork(makeNPC(), ctx), position: [61, 2 + VOXEL_SIZE * 2, 65] };
      const { updates } = tickNPC(npc, 2, ctx);
      const p = projectOnRoute(ring, updates.targetPosition[0], updates.targetPosition[2]);
      expect(p.off).toBeLessThan(0.01);
      expect(Math.hypot(updates.targetPosition[0] - 61, updates.targetPosition[2] - 65)).toBeLessThan(2.5); // the nearest bit of ring
    });

    test('on the ramp, they climb corner by corner toward the build spot', () => {
      const { ctx, route, goal } = highWorld();
      const foot = pointOnRoute(route, 0.5);
      const npc = { ...startWork(makeNPC(), ctx), position: foot };
      const { updates } = tickNPC(npc, 2, ctx);
      const p = projectOnRoute(route, updates.targetPosition[0], updates.targetPosition[2]);
      expect(p.along).toBeGreaterThan(0.5);
      expect(p.along).toBeLessThanOrEqual(goal + 0.01);
    });

    test('at the build spot on the ramp, they build', () => {
      const { ctx, route, goal } = highWorld();
      const npc = { ...startWork(makeNPC(), ctx), position: pointOnRoute(route, goal) };
      const { updates } = tickNPC(npc, 2, ctx);
      expect(updates.workTimer).toBe(2);
    });
  });

  test('placing the last block completes the building', () => {
    const ctx = buildWorld({ totalBlocks: 3, blocksPlaced: 2 });
    const working = startWork(makeNPC(), ctx);
    const npc = { ...working, position: AT_SITE, workTimer: ALMOST };

    const { updates, taskCompleted } = tickNPC(npc, 2, ctx);

    expect(ctx.host.getConstructionSites()[0].status).toBe('COMPLETE');
    expect(ctx.host.addPickupText).toHaveBeenCalledWith('Building complete!', '#44ff44');
    expect(taskCompleted).toBe(true);
    expect(getTask(working.currentTaskId)).toBeNull();
    expect(updates).toMatchObject({ state: 'IDLE', stateTimer: 0, currentTaskId: null, workTimer: 0, targetPosition: null });
    expect(updates.skills.building).toBeCloseTo(0.5 + NPC_SKILL_GROWTH, 10);
  });

  test('waits at a site that is not in BUILDING status', () => {
    const ctx = buildWorld();
    const npc = { ...startWork(makeNPC(), ctx), position: AT_SITE, workTimer: ALMOST };
    ctx.constructionSites = [makeSite({ status: 'PLACED' })];

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.workTimer).toBeUndefined();
    expect(ctx.host.advanceConstruction).not.toHaveBeenCalled();
  });

  test.each([
    ['was removed', []],
    ['is already complete', [makeSite({ status: 'COMPLETE' })]],
  ])('drops the task when the site %s', (_, sites) => {
    const ctx = buildWorld();
    const working = startWork(makeNPC(), ctx);
    ctx.constructionSites = sites;

    const { updates, taskCompleted } = tickNPC(working, 2, ctx);

    expect(taskCompleted).toBe(true);
    expect(getTask(working.currentTaskId)).toBeNull();
    expect(updates).toMatchObject({ state: 'IDLE', currentTaskId: null, workTimer: 0, targetPosition: null });
  });
});

// ── Needs interrupts and resuming ────────────────────────────

describe('Needs interrupts', () => {
  function workingMiner(ctxOverrides = {}) {
    const { chunkManager, zone } = makeMiningWorld();
    zone.miningTasks = zone.miningTasks.slice(0, 1);
    const ctx = setup({ zones: [zone, ...(ctxOverrides.extraZones || [])], chunkManager, ...ctxOverrides });
    const npc = { ...startWork(makeNPC(), ctx), workTimer: 3 };
    return { ctx, npc };
  }

  test('a hungry worker eats, parks its task and frees it for others', () => {
    const { ctx, npc } = workingMiner({ inventory: { materials: { berry: 2 } } });

    const { updates } = tickNPC({ ...npc, hunger: 5 }, 2, ctx);

    expect(ctx.host.removeMaterial).toHaveBeenCalledWith('berry', 1);
    expect(updates).toMatchObject({
      state: 'EATING',
      stateTimer: 0,
      eatingRestore: 10,
      currentTaskId: null,
      savedTaskId: npc.currentTaskId,
      savedWorkTimer: 3,
      savedHaulPhase: null,
      savedCarryingItem: null,
      workTimer: 0,
      targetPosition: null,
      thoughtBubble: { type: 'hungry', timer: NPC_THOUGHT_DURATION },
    });
    expect(getTask(npc.currentTaskId).claimedBy).toBeNull();
  });

  test('a hungry worker eats from a stockpile first', () => {
    const stockpile = makeStockpile({ storage: { items: { meat: 1 }, capacity: 100, usedCapacity: 1 } });
    const { ctx, npc } = workingMiner({ extraZones: [stockpile], inventory: { materials: { berry: 2 } } });

    const { updates } = tickNPC({ ...npc, hunger: 5 }, 2, ctx);

    expect(ctx.host.consumeFromStockpile).toHaveBeenCalledWith('stock_1', 'meat', 1);
    expect(ctx.host.removeMaterial).not.toHaveBeenCalled();
    expect(updates.eatingRestore).toBe(15);
  });

  test('a hungry worker with no food keeps working — and is not sent to bed either', () => {
    const { ctx, npc } = workingMiner();

    const { updates } = tickNPC({ ...npc, hunger: 5, rest: 5 }, 2, ctx);

    expect(updates.state).toBeUndefined();
    expect(updates.savedTaskId).toBeUndefined();
    expect(getTask(npc.currentTaskId).claimedBy).toBe('npc_1');
  });

  test('a tired worker sleeps and parks its task', () => {
    const { ctx, npc } = workingMiner();

    const { updates } = tickNPC({ ...npc, rest: 5 }, 2, ctx);

    expect(updates).toMatchObject({
      state: 'SLEEPING',
      stateTimer: 0,
      currentTaskId: null,
      savedTaskId: npc.currentTaskId,
      savedWorkTimer: 3,
      workTimer: 0,
      thoughtBubble: { type: 'sleeping', timer: NPC_THOUGHT_DURATION },
    });
    // No home in this context: heads for a spot by the campfire
    const [x, , z] = updates.targetPosition;
    expect(Math.hypot(x - ctx.center[0], z - ctx.center[2])).toBeLessThanOrEqual(HOUSING_CAMPFIRE_SLEEP_RADIUS);
    expect(getTask(npc.currentTaskId).claimedBy).toBeNull();
  });

  test('a hauler keeps what it is carrying across the interrupt', () => {
    const stockpile = makeStockpile({ storage: { items: { wood: 10 }, capacity: 100, usedCapacity: 10 } });
    const ctx = setup({ zones: [stockpile], constructionSites: [makeSite()] });
    const carrying = { material: 'wood', amount: 4 };
    const npc = { ...startWork(makeNPC(), ctx), haulPhase: 'deliver', carryingItem: carrying, rest: 5 };

    const { updates } = tickNPC(npc, 2, ctx);

    expect(updates.state).toBe('SLEEPING');
    expect(updates.savedHaulPhase).toBe('deliver');
    expect(updates.savedCarryingItem).toEqual(carrying);
  });
});

describe('Resuming after an interrupt', () => {
  function interruptedMiner() {
    const { chunkManager, zone } = makeMiningWorld();
    zone.miningTasks = zone.miningTasks.slice(0, 1);
    const ctx = setup({ zones: [zone], chunkManager });
    const working = { ...startWork(makeNPC(), ctx), workTimer: 3 };
    const { updates } = tickNPC({ ...working, rest: 5 }, 2, ctx);
    return { ctx, npc: { ...working, ...updates }, taskId: working.currentTaskId };
  }

  test('waking up goes straight back to the saved task with its progress', () => {
    const { ctx, npc, taskId } = interruptedMiner();

    const { updates } = tickNPC({ ...npc, rest: 79 }, 2, ctx);

    expect(updates).toMatchObject({
      state: 'WORKING_MINE',
      stateTimer: 0,
      currentTaskId: taskId,
      workTimer: 3,
      targetPosition: MINE_POS,
      savedTaskId: null,
      savedWorkTimer: 0,
      savedHaulPhase: null,
      savedCarryingItem: null,
      thoughtBubble: { type: 'mining', timer: NPC_THOUGHT_DURATION },
    });
    expect(getTask(taskId).claimedBy).toBe('npc_1');
  });

  test('finishing a meal resumes the saved task too', () => {
    const { ctx, npc, taskId } = interruptedMiner();
    const eating = { ...npc, state: 'EATING', stateTimer: 100, eatingRestore: 10, rest: 80 };

    const { updates } = tickNPC(eating, 2, ctx);

    expect(updates.state).toBe('WORKING_MINE');
    expect(updates.currentTaskId).toBe(taskId);
    expect(updates.eatingRestore).toBe(0);
  });

  test('stays IDLE if someone else took the task meanwhile', () => {
    const { ctx, npc, taskId } = interruptedMiner();
    claimTask(taskId, 'npc_other');

    const { updates } = tickNPC({ ...npc, rest: 79 }, 2, ctx);

    expect(updates.state).toBe('IDLE');
    expect(updates.savedTaskId).toBeNull();
    expect(getTask(taskId).claimedBy).toBe('npc_other');
  });

  test('stays IDLE if the task is gone', () => {
    const { ctx, npc } = interruptedMiner();
    clearTasks();

    const { updates } = tickNPC({ ...npc, rest: 79 }, 2, ctx);

    expect(updates.state).toBe('IDLE');
    expect(updates.savedTaskId).toBeNull();
  });

  test('a hauler interrupted mid-delivery resumes heading for the site, still carrying', () => {
    const stockpile = makeStockpile({ storage: { items: { wood: 10 }, capacity: 100, usedCapacity: 10 } });
    const ctx = setup({ zones: [stockpile], constructionSites: [makeSite()] });
    const carrying = { material: 'wood', amount: 4 };
    const working = { ...startWork(makeNPC(), ctx), haulPhase: 'deliver', carryingItem: carrying };
    const asleep = { ...working, ...tickNPC({ ...working, rest: 5 }, 2, ctx).updates };

    const { updates } = tickNPC({ ...asleep, rest: 79 }, 2, ctx);

    expect(updates.state).toBe('WORKING_HAUL');
    expect(updates.haulPhase).toBe('deliver');
    expect(updates.carryingItem).toEqual(carrying);
    expect(updates.targetPosition).toEqual([60, 2, 60]);
  });
});

// ── Leaving while employed ───────────────────────────────────

describe('Departure', () => {
  test('an NPC that leaves the settlement releases its task', () => {
    const { chunkManager, zone } = makeMiningWorld();
    const ctx = setup({ zones: [zone], chunkManager, worldTimeElapsed: DAY_LENGTH_SECONDS });
    const working = startWork(makeNPC(), ctx);
    const miserable = {
      ...working,
      hunger: 0, rest: 0, social: 0,
      unhappyDays: NPC_LEAVE_DEPARTURE_DAYS - 1,
      dayCheckpoint: 0,
    };

    const { updates } = tickNPC(miserable, 2, ctx);

    expect(updates.state).toBe('LEAVING');
    expect(updates.currentTaskId).toBeNull();
    expect(getTask(working.currentTaskId).claimedBy).toBeNull();
  });
});
