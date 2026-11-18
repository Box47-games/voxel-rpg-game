import useGameStore from '../useGameStore';
import { canPlaceNext, materialsUsed } from '../../modules/settlement/buildingInfo';

const s = () => useGameStore.getState();
const giveMaterials = (materials) =>
  useGameStore.setState({ inventory: { ...s().inventory, materials } });

describe('placing a construction site pays from the player inventory', () => {
  beforeEach(() => s().reset());

  test('with everything in hand: paid in full, ready to build', () => {
    giveMaterials({ wood: 30, stone: 4 });
    s().placeConstructionSite('wooden_shelter', [0, 0, 0], { wood: 25 }, 21);
    const site = s().constructionSites[0];
    expect(site.status).toBe('PLACED'); // until its first block goes in
    expect(canPlaceNext(site)).toBe(true);
    expect(site.materialsDelivered).toEqual({ wood: 25 });
    expect(s().inventory.materials).toEqual({ wood: 5, stone: 4 });
  });

  test('short: pays what it can and waits for settlers to haul the rest', () => {
    giveMaterials({ wood: 10 });
    s().placeConstructionSite('stone_house', [0, 0, 0], { wood: 15, stone: 20 }, 40);
    const site = s().constructionSites[0];
    expect(site.status).toBe('PLACED');
    expect(site.materialsDelivered).toEqual({ wood: 10 });
    expect(s().inventory.materials.wood).toBe(0);
  });

  test('a free site needs nothing and can be built straight away', () => {
    giveMaterials({});
    s().placeConstructionSite('farm_plot', [0, 0, 0], {}, 3);
    expect(canPlaceNext(s().constructionSites[0])).toBe(true);
  });

  test('a short site builds as far as its materials go, then waits', () => {
    giveMaterials({ wood: 5 });
    s().placeConstructionSite('wooden_shelter', [0, 0, 0], { wood: 25 }, 21);
    const id = s().constructionSites[0].id;
    let placed = 0;
    while (canPlaceNext(s().constructionSites[0]) && placed < 50) {
      s().advanceConstruction(id);
      placed++;
    }
    const site = s().constructionSites[0];
    expect(site.status).toBe('BUILDING');
    expect(placed).toBeGreaterThan(0);
    expect(placed).toBeLessThan(site.totalBlocks);
    // What it built cost no more than what was delivered
    expect(materialsUsed(site).wood).toBeLessThanOrEqual(5 + 1e-9);
    // More wood arrives: it carries on to the end
    giveMaterials({ wood: 30 });
    s().deliverToConstruction(id, 'wood', 20);
    while (canPlaceNext(s().constructionSites[0])) s().advanceConstruction(id);
    expect(s().constructionSites[0].status).toBe('COMPLETE');
    expect(materialsUsed(s().constructionSites[0]).wood).toBeCloseTo(25, 9);
  });

  test('cancelling a part-built site takes down what went up and refunds everything delivered', () => {
    const cleared = [];
    const world = {
      getBlock: () => 6, // WOOD, as placed
      setBlock: (x, y, z, t) => cleared.push(t),
    };
    useGameStore.setState({ _chunkManager: world });
    giveMaterials({ wood: 5 });
    s().placeConstructionSite('wooden_shelter', [0, 0, 0], { wood: 25 }, 21);
    const id = s().constructionSites[0].id;
    s().advanceConstruction(id);
    s().advanceConstruction(id);
    s().removeConstructionSite(id);
    expect(s().constructionSites).toHaveLength(0);
    expect(cleared).toEqual([0, 0]);
    expect(s().inventory.materials.wood).toBe(5);
    useGameStore.setState({ _chunkManager: null });
  });
});
