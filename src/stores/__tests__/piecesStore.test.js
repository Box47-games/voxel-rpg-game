import useGameStore from '../useGameStore';
import { findHaulSource } from '../../systems/settlement/TaskAssignmentEngine';

const s = () => useGameStore.getState();
const stockpile = (items = {}, used = 0) => ({ id: 'sp', type: 'STOCKPILE', bounds: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 }, storage: { items, capacity: 50, usedCapacity: used } });
const site = (required, delivered = {}) => ({ id: 'cs', buildingId: 'wooden_shelter', position: [0, 0, 0], status: 'PLACED', materialsRequired: required, materialsDelivered: delivered, blocksPlaced: 0, totalBlocks: 10 });

describe('block pieces in the store', () => {
  beforeEach(() => s().reset());

  test('placing a site pays with pieces by volume', () => {
    useGameStore.setState({ inventory: { ...s().inventory, materials: { wood_plank: 3, stone: 1 } } });
    s().placeConstructionSite('wooden_shelter', [0, 0, 0], { wood: 2, stone: 1 }, 10);
    const cs = s().constructionSites.at(-1);
    expect(cs.materialsDelivered).toEqual({ wood: 1.5, stone: 1 });
    expect(cs.status).toBe('PLACED');
    expect(s().inventory.materials.wood_plank).toBe(0);
  });

  test('a settler delivering a block for half a block returns a slab to the stockpile', () => {
    useGameStore.setState({ zones: [stockpile({}, 0)], constructionSites: [site({ stone: 1 }, { stone: 0.5 })] });
    s().npcDeliverToConstruction('cs', 'stone', 1, 'sp');
    expect(s().constructionSites[0].materialsDelivered.stone).toBe(1);
    expect(s().zones[0].storage.items).toEqual({ stone_slab: 1 });
    expect(s().zones[0].storage.usedCapacity).toBe(0.5);
  });

  test('a delivery the site no longer needs goes back to the stockpile', () => {
    useGameStore.setState({ zones: [stockpile({}, 0)], constructionSites: [site({ stone: 1 }, { stone: 1 })] });
    s().npcDeliverToConstruction('cs', 'stone_slab', 2, 'sp');
    expect(s().constructionSites[0].materialsDelivered.stone).toBe(1);
    expect(s().zones[0].storage.usedCapacity).toBe(1);
    // and to a site that has gone
    useGameStore.setState({ constructionSites: [] });
    s().npcDeliverToConstruction('cs', 'stone', 1, 'sp');
    expect(s().zones[0].storage.usedCapacity).toBe(2);
  });

  test('settlers haul slabs before blocks, and only what is needed', () => {
    const sp = stockpile({ stone: 5, stone_slab: 3 });
    expect(findHaulSource([sp], 'stone', 1)).toMatchObject({ key: 'stone_slab', amount: 2 });
    expect(findHaulSource([stockpile({ stone: 5 })], 'stone', 2.5)).toMatchObject({ key: 'stone', amount: 3 });
    expect(findHaulSource([stockpile({ dirt_cube: 20 })], 'dirt', 1)).toMatchObject({ key: 'dirt_cube', amount: 8 });
    expect(findHaulSource([stockpile({})], 'wood', 1)).toBeNull();
  });

  test('stockpile capacity counts volume', () => {
    useGameStore.setState({ zones: [stockpile({}, 0)], inventory: { ...s().inventory, materials: { dirt_cube: 16 } } });
    s().depositToStockpile('sp', 'dirt_cube', 16);
    expect(s().zones[0].storage.usedCapacity).toBe(2);
    s().withdrawFromStockpile('sp', 'dirt_cube', 8);
    expect(s().zones[0].storage.usedCapacity).toBe(1);
  });

  test('cancelling a part-paid site refunds blocks and pieces', () => {
    useGameStore.setState({ constructionSites: [site({ stone: 3 }, { stone: 1.5 })], inventory: { ...s().inventory, materials: {} } });
    s().removeConstructionSite('cs');
    expect(s().inventory.materials).toMatchObject({ stone: 1, stone_slab: 1 });
  });
});
