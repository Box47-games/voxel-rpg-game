import {
  getImmigrationStatus,
  summarizePopulation,
  summarizeResources,
  summarizeBuildings,
  getAlerts,
} from '../settlementSummary';
import {
  IMMIGRATION_THRESHOLD,
  IMMIGRATION_MAX_NPCS,
  NPC_LEAVE_WARNING_DAYS,
  NPC_LEAVE_DEPARTURE_DAYS,
} from '../../../data/tuning';

const CENTER = [0, 2, 0];
const npc = (id, extra = {}) => ({ id, fullName: `Settler ${id}`, state: 'IDLE', happiness: 60, hunger: 80, ...extra });
const shelter = (id, status = 'COMPLETE') => ({ id, buildingId: 'wooden_shelter', status, position: [0, 0, 0] });
const stockpile = (items, capacity = 100) => ({
  id: `sp_${Object.keys(items).join('_')}`,
  type: 'STOCKPILE',
  storage: { items, capacity, usedCapacity: Object.values(items).reduce((a, b) => a + b, 0) },
});

describe('immigration status', () => {
  test('explains what is holding the next settler back', () => {
    expect(getImmigrationStatus({ settlementCenter: null, npcs: [] }, 1)).toMatch(/campfire/);
    expect(getImmigrationStatus({ settlementCenter: CENTER, npcs: [npc('a')] }, 1)).toMatch(/Out of beds/);
    const full = Array.from({ length: IMMIGRATION_MAX_NPCS }, (_, i) => npc(`n${i}`));
    expect(getImmigrationStatus({ settlementCenter: CENTER, npcs: full }, IMMIGRATION_MAX_NPCS)).toMatch(/full/);
    expect(getImmigrationStatus({ settlementCenter: CENTER, npcs: [], attractiveness: 0 }, 1))
      .toBe(`Not attractive enough yet (0 / ${IMMIGRATION_THRESHOLD})`);
    expect(getImmigrationStatus({ settlementCenter: CENTER, npcs: [], attractiveness: 999 }, 1)).toMatch(/may arrive/);
  });
});

describe('population', () => {
  test('counts settlers, beds, homeless and average happiness of settled NPCs', () => {
    const pop = summarizePopulation(
      {
        settlementCenter: CENTER,
        attractiveness: 0,
        npcs: [npc('a', { homeId: 's1', happiness: 80 }), npc('b', { happiness: 40 }), npc('c', { state: 'APPROACHING', happiness: 0 })],
      },
      [shelter('s1'), shelter('s2'), shelter('s3', 'BUILDING')]
    );
    expect(pop).toMatchObject({ count: 3, settled: 2, arriving: 1, cap: 2, beds: 2, homeless: 1, avgHappiness: 60 });
  });

  test('no average without settled NPCs', () => {
    expect(summarizePopulation({ settlementCenter: null, npcs: [] }, []).avgHappiness).toBeNull();
  });
});

describe('resources', () => {
  test('totals all stockpiles, largest first, and counts food', () => {
    const res = summarizeResources([
      stockpile({ wood: 5, berry: 3 }),
      stockpile({ wood: 2, vegetable: 4, stone: 0 }, 50),
      { id: 'mine', type: 'MINING', storage: null },
    ]);
    expect(res.items).toEqual([
      { material: 'wood', amount: 7, isFood: false },
      { material: 'vegetable', amount: 4, isFood: true },
      { material: 'berry', amount: 3, isFood: true },
    ]);
    expect(res).toMatchObject({ food: 7, used: 14, capacity: 150, stockpiles: 2 });
  });
});

describe('buildings', () => {
  test('counts completed buildings by name and reports progress and missing materials', () => {
    const b = summarizeBuildings([
      shelter('a'), shelter('b'),
      { id: 'c', buildingId: 'stone_house', status: 'PLACED', materialsRequired: { stone: 40, wood: 10 }, materialsDelivered: { wood: 10, stone: 15 } },
      { id: 'd', buildingId: 'farm_plot', status: 'BUILDING', totalBlocks: 8, blocksPlaced: 2, materialsRequired: {}, materialsDelivered: {} },
    ]);
    expect(b.completed).toEqual([{ name: 'Wooden Shelter', count: 2 }]);
    expect(b.inProgress).toEqual([
      { id: 'c', name: 'Stone House', status: 'PLACED', stage: 'building', progress: 0, missing: { stone: 25 } },
      { id: 'd', name: 'Farm Plot', status: 'BUILDING', stage: 'building', progress: 0.25, missing: {} },
    ]);
  });
});

describe('alerts', () => {
  const base = { settlement: { settlementCenter: CENTER, npcs: [] }, zones: [stockpile({ berry: 5 })], constructionSites: [] };

  test('nothing to report for a healthy settlement or before founding one', () => {
    expect(getAlerts({ ...base, settlement: { ...base.settlement, npcs: [npc('a', { homeId: 'h' })] } })).toEqual([]);
    expect(getAlerts({ ...base, settlement: { settlementCenter: null, npcs: [npc('a')] } })).toEqual([]);
  });

  test('flags departures first, then starvation, homelessness and stalled buildings', () => {
    const alerts = getAlerts({
      settlement: {
        settlementCenter: CENTER,
        npcs: [
          npc('a', { homeId: 'h', unhappyDays: NPC_LEAVE_WARNING_DAYS }),
          npc('b', { hunger: 2 }),
        ],
      },
      zones: [stockpile({ wood: 1 })],
      constructionSites: [{ id: 'c', buildingId: 'stone_house', status: 'PLACED', materialsRequired: { stone: 40 }, materialsDelivered: {} }],
    });
    const daysLeft = NPC_LEAVE_DEPARTURE_DAYS - NPC_LEAVE_WARNING_DAYS;
    expect(alerts.map((a) => a.level)).toEqual(['danger', 'danger', 'warning', 'info']);
    expect(alerts[0].text).toMatch(`Settler a is unhappy and may leave in ${daysLeft} day`);
    expect(alerts[1].text).toBe('1 settler is starving and the stockpiles have no food');
    expect(alerts[2].text).toMatch(/1 settler is homeless/);
    expect(alerts[3].text).toBe('Stone House is waiting for 40 stone');
  });

  test('warns about empty food stores, missing or full stockpiles', () => {
    const settled = { settlementCenter: CENTER, npcs: [npc('a', { homeId: 'h' })] };
    expect(getAlerts({ ...base, settlement: settled, zones: [stockpile({ wood: 3 })] })[0].text).toMatch(/No food/);
    expect(getAlerts({ ...base, settlement: settled, zones: [] }).map((a) => a.text)).toContain(
      'No stockpile yet: settlers put what they gather in your inventory'
    );
    expect(getAlerts({ ...base, settlement: settled, zones: [stockpile({ berry: 10 }, 10)] })[0].text).toBe('Stockpiles are full');
  });
});
