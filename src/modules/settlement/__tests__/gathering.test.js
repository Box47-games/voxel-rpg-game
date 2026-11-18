/**
 * Settlers fell trees and forage near camp when stocks run low; farms plant
 * with seeds.
 */
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import { scanGatherTargets, fellTree } from '../../../systems/settlement/GatherScanner';
import { assessGather } from '../gathering';
import { tickNPC } from '../NPCStateMachine';
import { scanForTasks, getTask } from '../../../systems/settlement/TaskAssignmentEngine';
import { GATHER_WOOD_TARGET } from '../../../data/tuning';
import {
  makeFakeChunkManager,
  makeFakeHost,
  makeContext,
  makeNPC,
  makeStockpile,
} from './helpers/fakeWorld';

// Voxel centres: world = v * 2 + 1
const c = (v) => v * 2 + 1;

/** A generated-style tree: ground at vy 4, trunk vy 5..7, crown above. */
function plantTree(cm, vx, vz) {
  cm.place(c(vx), c(4), c(vz), BlockTypes.GRASS);
  for (let vy = 5; vy <= 7; vy++) cm.place(c(vx), c(vy), c(vz), BlockTypes.WOOD);
  for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
    cm.place(c(vx + dx), c(8), c(vz + dz), BlockTypes.LEAVES);
  }
  cm.place(c(vx), c(9), c(vz), BlockTypes.LEAVES);
}

describe('GatherScanner', () => {
  test('finds trees (trunk under leaves) and berry bushes, nearest first', () => {
    const cm = makeFakeChunkManager();
    plantTree(cm, 30, 30);
    plantTree(cm, 26, 26);
    cm.place(c(28), c(5), c(25), BlockTypes.BERRY_BUSH);
    const { trees, bushes } = scanGatherTargets(cm, [c(25), 10, c(25)], 32);
    expect(trees.map((t) => [t.x, t.y, t.z, t.trunk])).toEqual([[c(26), c(5), c(26), 3], [c(30), c(5), c(30), 3]]);
    expect(bushes.map((b) => [b.x, b.z])).toEqual([[c(28), c(25)]]);
  });

  test('wooden walls the player built are not trees', () => {
    const cm = makeFakeChunkManager();
    cm.place(c(20), c(4), c(20), BlockTypes.GRASS);
    cm.place(c(20), c(5), c(20), BlockTypes.WOOD);
    cm.place(c(20), c(6), c(20), BlockTypes.WOOD);
    expect(scanGatherTargets(cm, [c(20), 10, c(20)], 16).trees).toEqual([]);
  });

  test('felling clears the trunk and its crown', () => {
    const cm = makeFakeChunkManager();
    plantTree(cm, 30, 30);
    expect(fellTree(cm, c(30), c(5), c(30))).toBe(3);
    expect(scanGatherTargets(cm, [c(30), 10, c(30)], 8).trees).toEqual([]);
    expect(cm.getBlock(c(31), c(8), c(31))).toBe(BlockTypes.AIR);
    expect(cm.getBlock(c(30), c(4), c(30))).toBe(BlockTypes.GRASS); // the ground stays
  });
});

describe('assessGather', () => {
  const scan = { trees: [{ x: 1 }, { x: 2 }, { x: 3 }], bushes: [{ x: 1 }] };
  const pile = (items) => [{ id: 'sp', type: 'STOCKPILE', storage: { items } }];

  test('wood: a short site first, then topping up stock, then nothing', () => {
    const site = { status: 'PLACED', materialsRequired: { wood: 20 }, materialsDelivered: { wood: 5 } };
    expect(assessGather({ zones: pile({ wood: 10 }), constructionSites: [site], scan }).needWood).toBe('site');
    expect(assessGather({ zones: pile({ wood: 10 }), constructionSites: [], scan }).needWood).toBe('stock');
    expect(assessGather({ zones: pile({ wood: GATHER_WOOD_TARGET }), constructionSites: [], scan }).needWood).toBe(false);
  });

  test('food: forage when food is low, or farms have more empty tiles than seeds', () => {
    expect(assessGather({ zones: pile({ berry: 2 }), scan }).needFood).toBe(true);
    expect(assessGather({ zones: pile({ vegetable: 40, seed: 10 }), scan }).needFood).toBe(false);
    const farm = (empty, planted) => ({
      id: 'f', type: 'FARMING',
      farmTiles: [...Array(empty).fill({ plantedAt: null }), ...Array(planted).fill({ plantedAt: 5 })],
    });
    expect(assessGather({ zones: [...pile({ vegetable: 40, seed: 1 }), farm(3, 5)], scan }).needFood).toBe(true);
    expect(assessGather({ zones: [...pile({ vegetable: 40, seed: 3 }), farm(3, 5)], scan }).needFood).toBe(false);
  });

  test('only a couple of trees at a time; seeds count the stockpile and the bag', () => {
    const g = assessGather({ zones: pile({ seed: 2 }), inventory: { materials: { seed: 3 } }, scan });
    expect(g.trees).toHaveLength(2);
    expect(g.seeds).toBe(5);
  });
});

describe('settlers at work', () => {
  function world({ wood = 0, food = 0 } = {}) {
    const cm = makeFakeChunkManager();
    plantTree(cm, 30, 30);
    cm.place(c(33), c(5), c(30), BlockTypes.BERRY_BUSH);
    const sp = makeStockpile({ storage: { items: { wood, berry: food }, capacity: 500, usedCapacity: wood + food } });
    const host = makeFakeHost({ zones: [sp] });
    const ctx = makeContext({ host, chunkManager: cm, inventory: { materials: {} } });
    const scan = scanGatherTargets(cm, [c(30), 10, c(30)], 32);
    const gather = assessGather({ zones: [sp], constructionSites: [], inventory: ctx.inventory, scan });
    scanForTasks([sp], [], cm, 100, gather);
    return { cm, ctx, host };
  }
  const work = (npc, ctx, n = 20) => {
    let cur = npc;
    for (let i = 0; i < n; i++) {
      const { updates } = tickNPC(cur, 2, ctx);
      cur = { ...cur, ...updates };
      if (cur.targetPosition) cur.position = [...cur.targetPosition]; // walk there
      ctx.zones = ctx.host.getZones();
      if (cur.state === 'IDLE' && i > 0) break;
    }
    return cur;
  };

  test('with wood low they fell the tree and stock the wood', () => {
    const { cm, ctx, host } = world({ food: 50 });
    const npc = makeNPC({ position: [c(30), 10, c(28)], skills: { gathering: 1 } });
    const after = work(npc, ctx);
    expect(after.state).toBe('IDLE');
    expect(cm.getBlock(c(30), c(5), c(30))).toBe(BlockTypes.AIR);
    expect(host.getZones()[0].storage.items.wood).toBeGreaterThanOrEqual(3);
  });

  test('with food low they pick the bush: berries to the stockpile', () => {
    const { cm, ctx, host } = world({ wood: 100 });
    const npc = makeNPC({ position: [c(33), 10, c(28)], skills: { gathering: 1 } });
    work(npc, ctx);
    expect(cm.getBlock(c(33), c(5), c(30))).toBe(BlockTypes.AIR);
    expect(host.getZones()[0].storage.items.berry).toBeGreaterThan(0);
  });

  test('a bush they can\'t reach is given up on, and left alone for a while', () => {
    const { ctx } = world({ wood: 100 });
    const npc = makeNPC({ position: [c(33), 10, c(10)], skills: { gathering: 1 } });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('WORKING_FORAGE');
    // Still nowhere near it long after
    const stuck = { ...npc, ...updates, stateTimer: 60 };
    const r = tickNPC(stuck, 2, ctx).updates;
    expect(r.state).toBe('IDLE');
    expect(r.currentTaskId).toBeNull();
    // The next scan skips that bush
    const scan = scanGatherTargets(ctx.chunkAdapter, [c(30), 10, c(30)], 32);
    scanForTasks(ctx.zones, [], ctx.chunkAdapter, 110, assessGather({ zones: ctx.zones, constructionSites: [], inventory: ctx.inventory, scan }));
    const again = tickNPC(makeNPC({ id: 'other', position: [c(33), 10, c(28)] }), 2, ctx).updates;
    expect(again.state).not.toBe('WORKING_FORAGE');
  });

  test('stocked up: no felling or foraging', () => {
    const { ctx } = world({ wood: 100, food: 100 });
    const npc = makeNPC({ position: [c(30), 10, c(28)] });
    const { updates } = tickNPC(npc, 2, ctx);
    const type = updates.currentTaskId ? getTask(updates.currentTaskId)?.type : 'none';
    expect(['CHOP', 'FORAGE']).not.toContain(type);
  });
});
