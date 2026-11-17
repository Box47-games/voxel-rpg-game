import useGameStore from '../useGameStore';

const s = () => useGameStore.getState();
const giveMaterials = (materials) =>
  useGameStore.setState({ inventory: { ...s().inventory, materials } });

describe('placing a construction site pays from the player inventory', () => {
  beforeEach(() => s().reset());

  test('with everything in hand: paid in full and straight to BUILDING', () => {
    giveMaterials({ wood: 30, stone: 4 });
    s().placeConstructionSite('wooden_shelter', [0, 0, 0], { wood: 25 }, 21);
    const site = s().constructionSites[0];
    expect(site.status).toBe('BUILDING');
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

  test('a free site needs nothing and starts building', () => {
    giveMaterials({});
    s().placeConstructionSite('farm_plot', [0, 0, 0], {}, 3);
    expect(s().constructionSites[0].status).toBe('BUILDING');
  });
});
