import {
  getHomes,
  getTotalBeds,
  getPopulationCap,
  assignHomes,
  getSleepTarget,
  resolveHomeId,
} from '../housing';
import { getBuildingById } from '../../../data/buildings';
import { VOXEL_SIZE } from '../../../systems/chunks/coordinates';
import {
  HOUSING_FREE_SETTLERS,
  HOUSING_CAMPFIRE_SLEEP_RADIUS,
  IMMIGRATION_MAX_NPCS,
} from '../../../data/tuning';

const site = (id, buildingId, status = 'COMPLETE', position = [10, 4, 20]) =>
  ({ id, buildingId, status, position });
const npc = (id, state = 'IDLE', homeId) => ({ id, state, homeId });

describe('getHomes', () => {
  test('only completed buildings with beds are homes', () => {
    const homes = getHomes([
      site('a', 'wooden_shelter'),
      site('b', 'stone_house'),
      site('c', 'stone_house', 'BUILDING'),
      site('d', 'watchtower'),
      site('e', 'no_such_building'),
    ]);
    expect(homes.map((h) => [h.id, h.beds])).toEqual([['a', 1], ['b', 2]]);
    expect(homes[1].name).toBe('Stone House');
  });

  test('settlers sleep on the doorstep, centered outside the front wall', () => {
    const [home] = getHomes([site('a', 'stone_house', 'COMPLETE', [10, 4, 20])]);
    const width = getBuildingById('stone_house').size.width;
    expect(home.sleepPosition).toEqual([10 + (width * VOXEL_SIZE) / 2, 4, 20 - VOXEL_SIZE]);
  });

  test('handles missing site lists', () => {
    expect(getHomes(undefined)).toEqual([]);
  });
});

describe('population cap', () => {
  test('is one per bed, at least the free settlers, at most the global max', () => {
    expect(getPopulationCap([])).toBe(HOUSING_FREE_SETTLERS);
    const three = getHomes([site('a', 'wooden_shelter'), site('b', 'stone_house')]);
    expect(getTotalBeds(three)).toBe(3);
    expect(getPopulationCap(three)).toBe(Math.max(HOUSING_FREE_SETTLERS, 3));
    const many = Array.from({ length: IMMIGRATION_MAX_NPCS }, (_, i) => site(`h${i}`, 'stone_house'));
    expect(getPopulationCap(getHomes(many))).toBe(IMMIGRATION_MAX_NPCS);
  });
});

describe('assignHomes', () => {
  const homes = getHomes([site('shelter', 'wooden_shelter'), site('house', 'stone_house')]);

  test('fills beds in order and leaves the rest homeless', () => {
    const result = assignHomes([npc('a'), npc('b'), npc('c'), npc('d')], homes);
    expect([...result]).toEqual([['a', 'shelter'], ['b', 'house'], ['c', 'house'], ['d', null]]);
  });

  test('keeps existing homes before handing out free beds', () => {
    const result = assignHomes([npc('a'), npc('b', 'IDLE', 'shelter')], homes);
    expect(result.get('b')).toBe('shelter');
    expect(result.get('a')).toBe('house');
  });

  test('moves settlers out of homes that are gone or over capacity', () => {
    const result = assignHomes(
      [npc('a', 'IDLE', 'demolished'), npc('b', 'IDLE', 'shelter'), npc('c', 'IDLE', 'shelter')],
      homes
    );
    expect(result.get('b')).toBe('shelter');
    expect(result.get('a')).toBe('house');
    expect(result.get('c')).toBe('house');
  });

  test('arriving, evaluating and leaving NPCs get no bed and free theirs', () => {
    const result = assignHomes(
      [npc('a', 'APPROACHING'), npc('b', 'EVALUATING'), npc('c', 'LEAVING', 'shelter'), npc('d')],
      homes
    );
    expect(result.get('a')).toBeNull();
    expect(result.get('b')).toBeNull();
    expect(result.get('c')).toBeNull();
    expect(result.get('d')).toBe('shelter');
  });
});

describe('sleep target', () => {
  const homes = getHomes([site('house', 'stone_house')]);
  const ctx = { center: [0, 2, 0], homes: new Map(homes.map((h) => [h.id, h])) };

  test('a housed settler goes to its doorstep', () => {
    const target = getSleepTarget(npc('a'), { ...ctx, homeAssignments: new Map([['a', 'house']]) });
    expect(target).toEqual(homes[0].sleepPosition);
    expect(target).not.toBe(homes[0].sleepPosition); // a copy
  });

  test('a homeless settler sleeps near the campfire', () => {
    const [x, , z] = getSleepTarget(npc('a'), { ...ctx, homeAssignments: new Map([['a', null]]) });
    expect(Math.hypot(x, z)).toBeLessThanOrEqual(HOUSING_CAMPFIRE_SLEEP_RADIUS);
    expect(Math.hypot(x, z)).toBeGreaterThanOrEqual(HOUSING_CAMPFIRE_SLEEP_RADIUS * 0.5);
  });

  test('without tick assignments the NPC keeps its stored home', () => {
    expect(resolveHomeId(npc('a', 'IDLE', 'house'), ctx)).toBe('house');
    expect(getSleepTarget(npc('a', 'IDLE', 'house'), ctx)).toEqual(homes[0].sleepPosition);
    expect(getSleepTarget(npc('a'), { homes: new Map() })).toBeNull();
  });
});
