/**
 * Building upgrades: Shelter → House → Manor, grown in place from the same corner.
 */
import {
  getUpgradeProblem,
  getUpgradeLeftovers,
  getPlacedBlocks,
  placeNextBlock,
  getNextBlock,
} from '../buildingInfo';
import { getHomes } from '../housing';
import { summarizeBuildings } from '../settlementSummary';
import { getBuildingById, parseLayers, BUILDINGS } from '../../../data/buildings';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import { VOXEL_SIZE } from '../../../systems/chunks/coordinates';
import {
  UPGRADE_SHELTER_TO_HOUSE_COST,
  UPGRADE_HOUSE_TO_MANOR_SETTLERS,
} from '../../../data/tuning';
import useGameStore from '../../../stores/useGameStore';
import { makeFakeChunkManager } from './helpers/fakeWorld';

const GROUND_Y = 4; // buildings stand on the top of the ground layer at y=4
const shelterSite = (overrides = {}) => ({
  id: 'home', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [0, GROUND_Y, 0],
  materialsRequired: { wood: 25 }, materialsDelivered: { wood: 25 }, blocksPlaced: 24, totalBlocks: 24,
  ...overrides,
});

/** Flat ground under a wide area, with the given site's blocks built. */
function world(sites = []) {
  const cm = makeFakeChunkManager();
  for (let x = -10; x < 30; x += VOXEL_SIZE) {
    for (let z = -10; z < 30; z += VOXEL_SIZE) cm.place(x + 1, GROUND_Y - 1, z + 1, BlockTypes.STONE);
  }
  for (const site of sites) for (const b of getPlacedBlocks(site)) cm.place(b.x, b.y, b.z, b.blockType);
  return cm;
}

const env = (cm, overrides = {}) => ({
  constructionSites: [shelterSite()],
  settledCount: 5,
  getBlock: (x, y, z) => cm.getBlock(x, y, z),
  ...overrides,
});

describe('upgrade paths', () => {
  test('Shelter → House → Manor; the Manor is not in the build catalog', () => {
    expect(getBuildingById('wooden_shelter').upgrade.to).toBe('stone_house');
    expect(getBuildingById('stone_house').upgrade.to).toBe('manor');
    expect(getBuildingById('manor').effects.housing).toBe(4);
    expect(BUILDINGS.filter((b) => !b.upgradeOnly).map((b) => b.id)).not.toContain('manor');
  });
});

describe('getUpgradeProblem', () => {
  test('a free, level spot with enough settlers is fine', () => {
    const cm = world([shelterSite()]);
    expect(getUpgradeProblem(shelterSite(), env(cm))).toBeNull();
  });

  test('explains every blocker', () => {
    const cm = world([shelterSite()]);
    expect(getUpgradeProblem({ ...shelterSite(), buildingId: 'farm_plot' }, env(cm))).toMatch(/no upgrade/);
    expect(getUpgradeProblem(shelterSite({ status: 'BUILDING' }), env(cm))).toMatch(/Finish/);
    const house = shelterSite({ buildingId: 'stone_house' });
    expect(getUpgradeProblem(house, env(cm, { settledCount: UPGRADE_HOUSE_TO_MANOR_SETTLERS - 1 }))).toMatch(/Needs 2 settlers/);

    const neighbour = { id: 'n', buildingId: 'farm_plot', status: 'COMPLETE', position: [3 * VOXEL_SIZE, GROUND_Y, 0] };
    expect(getUpgradeProblem(shelterSite(), env(cm, { constructionSites: [shelterSite(), neighbour] })))
      .toBe('Too close to the Farm Plot');

    const blocked = world([shelterSite()]);
    blocked.place(3 * VOXEL_SIZE + 1, GROUND_Y + 1, 1, BlockTypes.DIRT); // in the House's new column
    expect(getUpgradeProblem(shelterSite(), env(blocked))).toMatch(/in the way/);

    const cliff = world([shelterSite()]);
    cliff.place(3 * VOXEL_SIZE + 1, GROUND_Y - 1, 1, BlockTypes.AIR);
    expect(getUpgradeProblem(shelterSite(), env(cliff))).toMatch(/not level/);
  });

  test('skips the terrain checks when the world is not available', () => {
    expect(getUpgradeProblem(shelterSite(), env(null, { getBlock: null }))).toBeNull();
  });
});

describe('building an upgrade', () => {
  const upgrading = (overrides = {}) => shelterSite({
    buildingId: 'stone_house', upgradeFrom: 'wooden_shelter', status: 'BUILDING', blocksPlaced: 0,
    totalBlocks: parseLayers(getBuildingById('stone_house')).length, ...overrides,
  });

  test('leftovers are the old blocks the new blueprint leaves empty', () => {
    const leftovers = getUpgradeLeftovers(upgrading());
    const houseCells = new Set(parseLayers(getBuildingById('stone_house')).map((b) => `${b.x},${b.y},${b.z}`));
    expect(leftovers.length).toBeGreaterThan(0);
    for (const b of leftovers) {
      const cell = `${(b.x - VOXEL_SIZE / 2) / VOXEL_SIZE},${(b.y - GROUND_Y - VOXEL_SIZE / 2) / VOXEL_SIZE},${(b.z - VOXEL_SIZE / 2) / VOXEL_SIZE}`;
      expect(houseCells.has(cell)).toBe(false);
    }
  });

  test('the first block clears the leftovers; player blocks there are kept', () => {
    const cm = world([shelterSite()]);
    const [first, second] = getUpgradeLeftovers(upgrading());
    cm.place(second.x, second.y, second.z, BlockTypes.DIRT); // the player changed this one
    placeNextBlock(upgrading(), cm);
    expect(cm.getBlock(first.x, first.y, first.z)).toBe(BlockTypes.AIR);
    expect(cm.getBlock(second.x, second.y, second.z)).toBe(BlockTypes.DIRT);
    const next = getNextBlock(upgrading());
    expect(cm.getBlock(next.x, next.y, next.z)).toBe(next.blockType);

    // Later blocks don't touch leftovers again
    cm.setBlock.mockClear();
    placeNextBlock(upgrading({ blocksPlaced: 1 }), cm);
    expect(cm.setBlock).toHaveBeenCalledTimes(1);
  });

  test('residents keep their old beds until the upgrade finishes', () => {
    expect(getHomes([upgrading()]).map((h) => [h.id, h.beds])).toEqual([['home', 1]]);
    expect(getHomes([upgrading({ status: 'COMPLETE' })]).map((h) => h.beds)).toEqual([2]);
  });

  test('the dashboard names the upgrade', () => {
    expect(summarizeBuildings([upgrading()]).inProgress[0].name).toBe('Stone House (upgrading the Wooden Shelter)');
  });
});

describe('store: upgradeBuilding and cancelling', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    const s = useGameStore.getState();
    useGameStore.setState({
      _chunkManager: world([shelterSite()]),
      constructionSites: [shelterSite()],
      settlement: { ...s.settlement, npcs: [{ id: 'a', state: 'IDLE', homeId: 'home' }] },
      inventory: { ...s.inventory, materials: { wood: 100, stone: 100 } },
    });
  });

  test('turns the building into an upgrade site that keeps its id', () => {
    expect(useGameStore.getState().upgradeBuilding('home')).toBeNull();
    const [site] = useGameStore.getState().constructionSites;
    expect(site).toMatchObject({
      id: 'home',
      buildingId: 'stone_house',
      upgradeFrom: 'wooden_shelter',
      status: 'PLACED',
      materialsRequired: UPGRADE_SHELTER_TO_HOUSE_COST,
      materialsDelivered: {},
      blocksPlaced: 0,
      totalBlocks: parseLayers(getBuildingById('stone_house')).length,
    });
  });

  test('reports why it cannot start', () => {
    const s = useGameStore.getState();
    useGameStore.setState({ settlement: { ...s.settlement, npcs: [] } });
    expect(useGameStore.getState().upgradeBuilding('home')).toMatch(/Needs 1 settler/);
    expect(useGameStore.getState().constructionSites[0].status).toBe('COMPLETE');
  });

  test('cancelling before building restores the original and refunds deliveries', () => {
    const store = useGameStore.getState();
    store.upgradeBuilding('home');
    useGameStore.getState().deliverToConstruction('home', 'wood', 10);
    expect(useGameStore.getState().inventory.materials.wood).toBe(90);

    useGameStore.getState().removeConstructionSite('home');

    const [site] = useGameStore.getState().constructionSites;
    expect(site).toMatchObject({ id: 'home', buildingId: 'wooden_shelter', status: 'COMPLETE' });
    expect(site.upgradeFrom).toBeUndefined();
    expect(useGameStore.getState().inventory.materials.wood).toBe(100);
  });

  test('an upgrade already replacing blocks cannot be cancelled', () => {
    useGameStore.getState().upgradeBuilding('home');
    useGameStore.setState({
      constructionSites: useGameStore.getState().constructionSites.map((s) => ({ ...s, status: 'BUILDING', blocksPlaced: 3 })),
    });
    useGameStore.getState().removeConstructionSite('home');
    expect(useGameStore.getState().constructionSites[0]).toMatchObject({ status: 'BUILDING', buildingId: 'stone_house' });
  });
});
