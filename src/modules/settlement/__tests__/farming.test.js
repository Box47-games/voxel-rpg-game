/**
 * Farming: tiles and growth, the Farm Plot requirement, farm tasks, settlers
 * planting and harvesting, and unattended collection.
 */
import {
  createFarmTiles,
  getTileStage,
  getTileGrowth,
  TileStage,
  getFarmPlots,
  hasFarmPlotNear,
  getFarmZoneProblem,
  getActiveFarms,
  collectUnattended,
} from '../farming';
import { tickNPC } from '../NPCStateMachine';
import SettlementModule from '../SettlementModule';
import {
  scanForTasks,
  clearTasks,
  findBestTask,
  claimTask,
  isZoneBeingFarmed,
} from '../../../systems/settlement/TaskAssignmentEngine';
import { VOXEL_SIZE } from '../../../systems/chunks/coordinates';
import {
  FARM_GROW_TIME,
  FARM_HARVEST_YIELD,
  FARM_UNATTENDED_RATE,
  FARM_MAX_TILES,
  FARM_PLOT_RANGE,
  FARM_CROP_MATERIAL,
  MAX_FARMERS_PER_ZONE,
  NPC_NEEDS_TICK_INTERVAL,
} from '../../../data/tuning';
import {
  makeFakeChunkManager,
  makeChunkAdapter,
  makeFakeHost,
  makeNPC,
  makeContext,
  makeStockpile,
} from './helpers/fakeWorld';

const T0 = 1000; // world time used as "now" unless a test says otherwise
const BOUNDS = { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }; // 2x2 voxels = 4 tiles
const plot = (overrides = {}) => ({
  id: 'plot', buildingId: 'farm_plot', status: 'COMPLETE', position: [8, 2, 0], ...overrides,
});
const farmZone = (tiles = createFarmTiles(BOUNDS, () => 2), overrides = {}) => ({
  id: 'farm_1', type: 'FARMING', bounds: BOUNDS, storage: null, farmTiles: tiles, ...overrides,
});
const tileAt = (plantedAt, extra = {}) => ({ x: 1, y: 2, z: 1, plantedAt, collectedAt: null, ...extra });

beforeEach(() => clearTasks());

describe('tiles and growth', () => {
  test('one tile per ground voxel, centred, at ground height', () => {
    const tiles = createFarmTiles(BOUNDS, (x, z) => x + z);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toEqual({ x: VOXEL_SIZE / 2, y: VOXEL_SIZE, z: VOXEL_SIZE / 2, plantedAt: null, collectedAt: null });
  });

  test('empty → growing → ready over FARM_GROW_TIME', () => {
    expect(getTileStage(tileAt(null), T0)).toBe(TileStage.EMPTY);
    expect(getTileStage(tileAt(T0), T0 + FARM_GROW_TIME - 1)).toBe(TileStage.GROWING);
    expect(getTileStage(tileAt(T0), T0 + FARM_GROW_TIME)).toBe(TileStage.READY);
    expect(getTileGrowth(tileAt(T0), T0 + FARM_GROW_TIME / 2)).toBeCloseTo(0.5);
    expect(getTileGrowth(tileAt(T0), T0 + FARM_GROW_TIME * 3)).toBe(1);
    expect(getTileGrowth(tileAt(null), T0)).toBe(0);
  });
});

describe('Farm Plot requirement', () => {
  test('only completed Farm Plots count', () => {
    expect(getFarmPlots([plot(), plot({ id: 'b', status: 'BUILDING' }), plot({ id: 'c', buildingId: 'stone_house' })])
      .map((p) => p.id)).toEqual(['plot']);
  });

  test('the plot must be within range of the zone edge', () => {
    const near = getFarmPlots([plot({ position: [BOUNDS.maxX + FARM_PLOT_RANGE - 4, 2, 0] })]);
    const far = getFarmPlots([plot({ position: [BOUNDS.maxX + FARM_PLOT_RANGE + 10, 2, 0] })]);
    expect(hasFarmPlotNear(BOUNDS, near)).toBe(true);
    expect(hasFarmPlotNear(BOUNDS, far)).toBe(false);
  });

  test('placing a farm explains what is missing', () => {
    expect(getFarmZoneProblem(BOUNDS, [])).toMatch(/Farm Plot/);
    const huge = { minX: 0, minZ: 0, maxX: VOXEL_SIZE * 9, maxZ: VOXEL_SIZE * 8 };
    expect(getFarmZoneProblem(huge, [plot()])).toMatch(`max ${FARM_MAX_TILES}`);
    expect(getFarmZoneProblem(BOUNDS, [plot()])).toBeNull();
  });

  test('farms without a plot nearby, or without tiles, are not active', () => {
    expect(getActiveFarms([farmZone()], [])).toEqual([]);
    expect(getActiveFarms([farmZone(undefined, { farmTiles: undefined })], [plot()])).toEqual([]);
    expect(getActiveFarms([farmZone()], [plot()])).toHaveLength(1);
  });
});

describe('farm tasks', () => {
  const farmer = (id) => makeNPC({ id, position: [1, 2, 1], preferredJob: 'farmer' });

  test('plant empty tiles, harvest ripe ones, leave growing ones alone', () => {
    const tiles = [tileAt(null), tileAt(T0 - 10), tileAt(T0 - FARM_GROW_TIME)];
    scanForTasks([farmZone(tiles)], [plot()], null, T0);
    const tasks = [];
    for (let i = 0; i < 3; i++) {
      const t = findBestTask(farmer(`f${i}`));
      if (!t) break;
      claimTask(t.id, `f${i}`);
      tasks.push(t);
    }
    expect(tasks.map((t) => [t._tileIndex, t.farmAction]).sort()).toEqual([[0, 'PLANT'], [2, 'HARVEST']]);
    expect(tasks.find((t) => t.farmAction === 'HARVEST').priority).toBeGreaterThan(
      tasks.find((t) => t.farmAction === 'PLANT').priority
    );
  });

  test('no farm tasks without a Farm Plot or without world time', () => {
    scanForTasks([farmZone()], [], null, T0);
    expect(findBestTask(farmer('a'))).toBeNull();
    scanForTasks([farmZone()], [plot()], null);
    expect(findBestTask(farmer('a'))).toBeNull();
  });

  test(`at most ${MAX_FARMERS_PER_ZONE} settlers work one farm`, () => {
    scanForTasks([farmZone()], [plot()], null, T0); // 4 empty tiles
    for (let i = 0; i < MAX_FARMERS_PER_ZONE; i++) {
      const t = findBestTask(farmer(`f${i}`));
      expect(claimTask(t.id, `f${i}`)).toBe(true);
    }
    expect(findBestTask(farmer('extra'))).toBeNull();
    expect(isZoneBeingFarmed('farm_1')).toBe(true);
  });
});

describe('settlers farming', () => {
  function setup(tiles, { stockpile = true } = {}) {
    const zones = [farmZone(tiles)];
    if (stockpile) zones.push(makeStockpile({ storage: { items: {}, capacity: 100, usedCapacity: 0 } }));
    const host = makeFakeHost({ zones, constructionSites: [plot()] });
    const ctx = makeContext({ host, zones: host.getZones(), constructionSites: [plot()], worldTimeElapsed: T0 });
    scanForTasks(host.getZones(), [plot()], null, T0);
    return { host, ctx };
  }
  const work = (npc, ctx) => ({ ...npc, ...tickNPC(npc, 30, ctx).updates });

  test('a settler walks over and plants an empty tile', () => {
    const { host, ctx } = setup([tileAt(null)]);
    const npc = work(makeNPC({ position: [1, 2, 1] }), ctx);
    expect(npc.state).toBe('WORKING_FARM');
    expect(npc.thoughtBubble.type).toBe('farming');

    const done = work(npc, ctx);
    expect(done.state).toBe('IDLE');
    expect(host.getZones()[0].farmTiles[0].plantedAt).toBe(T0);
    expect(done.skills.gathering).toBeGreaterThan(npc.skills.gathering);
  });

  test('harvesting empties the tile and puts the crop in a stockpile', () => {
    const { host, ctx } = setup([tileAt(T0 - FARM_GROW_TIME)]);
    work(work(makeNPC({ position: [1, 2, 1] }), ctx), ctx);
    const [farm, stockpile] = host.getZones();
    expect(farm.farmTiles[0].plantedAt).toBeNull();
    expect(stockpile.storage.items[FARM_CROP_MATERIAL]).toBe(FARM_HARVEST_YIELD);
  });

  test('with no stockpile space the crop goes to the player', () => {
    const { host, ctx } = setup([tileAt(T0 - FARM_GROW_TIME)], { stockpile: false });
    work(work(makeNPC({ position: [1, 2, 1] }), ctx), ctx);
    expect(host.addMaterial).toHaveBeenCalledWith(FARM_CROP_MATERIAL, FARM_HARVEST_YIELD);
  });

  test('a tile someone else already planted is left alone', () => {
    const { host, ctx } = setup([tileAt(null)]);
    const npc = work(makeNPC({ position: [1, 2, 1] }), ctx);
    host.updateZone('farm_1', { farmTiles: [tileAt(T0 - 5)] });
    work(npc, ctx);
    expect(host.getZones()[0].farmTiles[0].plantedAt).toBe(T0 - 5);
  });
});

describe('unattended farms', () => {
  const ready = T0 - FARM_GROW_TIME;
  const perTile = Math.max(1, Math.round(FARM_HARVEST_YIELD * FARM_UNATTENDED_RATE));

  test('ripe crops trickle in once per growth cycle while nobody tends them', () => {
    const zone = farmZone([tileAt(ready), tileAt(ready), tileAt(null)]);
    expect(collectUnattended(zone, T0, false)).toBeNull(); // just ripened
    const first = collectUnattended(zone, T0 + FARM_GROW_TIME, false);
    expect(first.amount).toBe(2 * perTile);
    expect(first.farmTiles[0].plantedAt).toBe(ready); // still ripe for a farmer
    const again = collectUnattended({ ...zone, farmTiles: first.farmTiles }, T0 + FARM_GROW_TIME + 10, false);
    expect(again).toBeNull();
  });

  test('nothing is collected while a settler works the farm', () => {
    expect(collectUnattended(farmZone([tileAt(ready)]), T0 + FARM_GROW_TIME, true)).toBeNull();
  });

  test('the settlement engine deposits unattended crops into a stockpile', () => {
    const stockpile = makeStockpile({ storage: { items: {}, capacity: 100, usedCapacity: 0 } });
    const host = makeFakeHost({ zones: [farmZone([tileAt(ready)]), stockpile], constructionSites: [plot()] });
    const module = new SettlementModule();
    module.initialize();
    module.setChunkAdapter(makeChunkAdapter(makeFakeChunkManager()));
    module.setHost(host);

    module.tickSettlementCore(NPC_NEEDS_TICK_INTERVAL, {
      settlement: { npcs: [], attractiveness: 0, settlementCenter: [50, 2, 50] },
      zones: host.getZones(),
      constructionSites: [plot()],
      inventory: { materials: {} },
      rifts: [],
      worldTime: { elapsed: T0 + FARM_GROW_TIME },
    });

    expect(host.getZones()[1].storage.items[FARM_CROP_MATERIAL]).toBe(perTile);
  });
});
