import {
  getSiteCenter,
  getPlacedBlocks,
  getDemolishRefund,
  getConstructionEta,
  getFarmsPoweredBy,
  getResidents,
  paymentSchedule,
  canPlaceNext,
  nextCellShortfall,
  needsMaterials,
  siteStage,
  materialsUsed,
  buildProgress,
  nextCellWork,
} from '../buildingInfo';
import { getBuildingById, parseLayers } from '../../../data/buildings';
import { VOXEL_SIZE } from '../../../systems/chunks/coordinates';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import {
  BUILDING_DEMOLISH_REFUND,
  CONSTRUCTION_BLOCK_INTERVAL,
  NPC_BUILD_DURATION,
} from '../../../data/tuning';
import useGameStore from '../../../stores/useGameStore';

const shelter = getBuildingById('wooden_shelter');
const site = (overrides = {}) => ({
  id: 's1', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [10, 4, 20],
  blocksPlaced: 0, totalBlocks: parseLayers(shelter).length, ...overrides,
});

describe('placed blocks', () => {
  test('a completed building has all its blueprint blocks, at voxel centres', () => {
    const blocks = getPlacedBlocks(site());
    const first = parseLayers(shelter)[0];
    expect(blocks).toHaveLength(parseLayers(shelter).length);
    expect(blocks[0]).toEqual({
      x: 10 + first.x * VOXEL_SIZE + VOXEL_SIZE / 2,
      y: 4 + first.y * VOXEL_SIZE + VOXEL_SIZE / 2,
      z: 20 + first.z * VOXEL_SIZE + VOXEL_SIZE / 2,
      blockType: first.blockType,
      shape: 0,
    });
  });

  test('a site under construction only has the blocks placed so far', () => {
    expect(getPlacedBlocks(site({ status: 'BUILDING', blocksPlaced: 3 }))).toHaveLength(3);
    expect(getPlacedBlocks(site({ buildingId: 'nope' }))).toEqual([]);
  });

  test('centre of the footprint', () => {
    expect(getSiteCenter(site())).toEqual([10 + (shelter.size.width * VOXEL_SIZE) / 2, 4, 20 + (shelter.size.depth * VOXEL_SIZE) / 2]);
  });
});

describe('demolish refund', () => {
  test(`returns ${BUILDING_DEMOLISH_REFUND * 100}% of the cost, rounded down`, () => {
    expect(getDemolishRefund(getBuildingById('stone_house'))).toEqual({ stone: 40, wood: 20 });
    expect(getDemolishRefund({ cost: { iron: 1 } })).toEqual({});
  });
});

describe('construction ETA', () => {
  test('self-building pace without a builder, settler pace with one', () => {
    const paid = { materialsRequired: { ...shelter.cost }, materialsDelivered: { ...shelter.cost } };
    const building = site({ status: 'BUILDING', blocksPlaced: 16, totalBlocks: 20, ...paid }); // four sill logs left
    expect(getConstructionEta(building)).toBe(4 * CONSTRUCTION_BLOCK_INTERVAL);
    expect(getConstructionEta(building, 0.5)).toBe(4 * NPC_BUILD_DURATION / 0.5);
    // Still waiting for materials: no ETA
    expect(getConstructionEta(site({ status: 'PLACED', materialsRequired: { ...shelter.cost }, materialsDelivered: {} }))).toBeNull();
  });
});

describe('farms and residents', () => {
  test('a Farm Plot powers farm zones within range', () => {
    const plot = site({ id: 'p', buildingId: 'farm_plot', position: [0, 2, 0] });
    const near = { id: 'f1', type: 'FARMING', bounds: { minX: 8, minZ: 0, maxX: 12, maxZ: 4 } };
    const far = { id: 'f2', type: 'FARMING', bounds: { minX: 200, minZ: 0, maxX: 204, maxZ: 4 } };
    expect(getFarmsPoweredBy(plot, [near, far, { id: 'm', type: 'MINING', bounds: near.bounds }]).map((z) => z.id)).toEqual(['f1']);
    expect(getFarmsPoweredBy(site(), [near])).toEqual([]); // not a farm plot
  });

  test('residents are the settlers whose home is this building', () => {
    expect(getResidents(site(), [{ id: 'a', homeId: 's1' }, { id: 'b', homeId: 'x' }, { id: 'c' }]).map((n) => n.id)).toEqual(['a']);
  });
});

describe('demolishBuilding (store)', () => {
  beforeEach(() => useGameStore.getState().reset());

  function world(blocks) {
    const map = new Map(blocks.map((b) => [`${b.x},${b.y},${b.z}`, b.blockType]));
    return {
      getBlock: (x, y, z) => map.get(`${x},${y},${z}`) || 0,
      setBlock: vi.fn((x, y, z, type) => { map.set(`${x},${y},${z}`, type); return true; }),
      map,
    };
  }

  test('clears the building, refunds half its cost and removes the site', () => {
    const blocks = getPlacedBlocks(site());
    const cm = world(blocks);
    // The player replaced one block with stone: that one is left alone
    cm.map.set(`${blocks[0].x},${blocks[0].y},${blocks[0].z}`, 1);
    const s = useGameStore.getState();
    useGameStore.setState({
      _chunkManager: cm,
      constructionSites: [site()],
      activeConstructionSiteId: 's1',
      inventory: { ...s.inventory, materials: { wood: 3 } },
    });

    const refund = useGameStore.getState().demolishBuilding('s1');

    expect(refund).toEqual({ wood: Math.floor(shelter.cost.wood * BUILDING_DEMOLISH_REFUND) });
    const after = useGameStore.getState();
    expect(after.constructionSites).toEqual([]);
    expect(after.activeConstructionSiteId).toBeNull();
    expect(after.inventory.materials.wood).toBe(3 + refund.wood);
    expect(cm.setBlock).toHaveBeenCalledTimes(blocks.length - 1);
    expect(cm.getBlock(blocks[0].x, blocks[0].y, blocks[0].z)).toBe(1);
    expect(cm.getBlock(blocks[1].x, blocks[1].y, blocks[1].z)).toBe(0);
  });

  test('refuses sites that are not complete', () => {
    useGameStore.setState({ constructionSites: [site({ status: 'BUILDING' })] });
    expect(useGameStore.getState().demolishBuilding('s1')).toBeNull();
    expect(useGameStore.getState().constructionSites).toHaveLength(1);
  });
});

describe('paying as you build', () => {
  const house = getBuildingById('stone_house');
  const cells = parseLayers(house);
  const houseSite = (over = {}) => ({
    id: 'h', buildingId: 'stone_house', status: 'PLACED', position: [0, 0, 0],
    materialsRequired: { ...house.cost }, materialsDelivered: {}, blocksPlaced: 0, totalBlocks: cells.length, ...over,
  });

  test('each material is spread over its own cells by volume; the last cell takes the rest', () => {
    const schedule = paymentSchedule(houseSite());
    expect(schedule).toHaveLength(cells.length);
    expect(schedule[cells.length - 1]).toEqual(house.cost);
    // Stone only goes up on stone cells; a slab costs half what a stone block does
    const stoneStep = (i) => schedule[i].stone - (i ? schedule[i - 1].stone : 0);
    const block = cells.findIndex((c) => c.blockType === BlockTypes.STONE && !c.shape);
    const slab = cells.findIndex((c) => c.blockType === BlockTypes.STONE && c.shape);
    const wood = cells.findIndex((c) => c.blockType === BlockTypes.WOOD);
    expect(stoneStep(slab)).toBeCloseTo(stoneStep(block) / 2, 9);
    expect(stoneStep(wood)).toBe(0);
  });

  test('a cost no cell uses is spread over every cell', () => {
    const s = paymentSchedule({ ...houseSite(), materialsRequired: { iron: 10 } });
    expect(s[0].iron).toBeGreaterThan(0);
    expect(s[s.length - 1].iron).toBe(10);
  });

  test('builds while the next cell is paid for; says what it is short', () => {
    expect(canPlaceNext(houseSite())).toBe(false);
    expect(siteStage(houseSite())).toBe('waiting');
    const first = paymentSchedule(houseSite())[0];
    const ready = houseSite({ materialsDelivered: { ...first } });
    expect(canPlaceNext(ready)).toBe(true);
    expect(siteStage(ready)).toBe('building');
    expect(Object.keys(nextCellShortfall(houseSite()))).toEqual(['stone']);
    expect(needsMaterials(ready)).toBe(true);
    expect(needsMaterials(houseSite({ materialsDelivered: { ...house.cost } }))).toBe(false);
  });

  test('materials used follow what is built', () => {
    expect(materialsUsed(houseSite())).toEqual({});
    expect(materialsUsed(houseSite({ status: 'COMPLETE' }))).toEqual(house.cost);
    expect(buildProgress(houseSite({ status: 'BUILDING', blocksPlaced: cells.length / 2 }))).toBe(0.5);
  });
});

describe('build time per cell', () => {
  test('a slab or plank cell takes half a block\'s time', () => {
    const house = getBuildingById('stone_house');
    const cells = parseLayers(house);
    const slab = cells.findIndex((c) => c.shape);
    const block = cells.findIndex((c) => !c.shape);
    const at = (i) => nextCellWork({ buildingId: 'stone_house', blocksPlaced: i });
    expect(at(block)).toBe(1);
    expect(at(slab)).toBe(0.5);
    expect(nextCellWork({ buildingId: 'nope' })).toBe(1);
  });
});
