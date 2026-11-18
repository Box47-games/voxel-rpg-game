import { describe, it, expect } from 'vitest';
import {
  RECIPE_LEVELS,
  BUILDING_MILESTONES,
  recipeLock,
  buildingLock,
  unlockedIds,
} from '../unlocks';
import { CRAFTING_RECIPES } from '../craftingRecipes';
import { BUILDINGS } from '../buildings';
import { unlockAnnouncements } from '../../components/ui/UnlockWatcher';

const settler = (id) => ({ id, state: 'IDLE', settled: true });
const state = ({ level = 1, settlers = 0, center = null, closed = 0 } = {}) => ({
  player: { level },
  settlement: {
    settlementCenter: center,
    npcs: Array.from({ length: settlers }, (_, i) => settler(`n${i}`)),
  },
  _riftManager: {
    rifts: Array.from({ length: closed }, (_, i) => ({ id: i, state: 'CLOSED' })),
  },
});

describe('unlocks', () => {
  it('only names recipes and buildings that exist', () => {
    for (const id of Object.keys(RECIPE_LEVELS)) expect(CRAFTING_RECIPES[id], id).toBeTruthy();
    const ids = new Set(BUILDINGS.map((b) => b.id));
    for (const id of Object.keys(BUILDING_MILESTONES)) expect(ids.has(id), id).toBe(true);
  });

  it('keeps starter gear open and locks the rest by level', () => {
    const open = Object.values(CRAFTING_RECIPES).filter((r) => !recipeLock(r, state()));
    expect(open.length).toBeGreaterThan(0);
    expect(recipeLock(CRAFTING_RECIPES.ironPickaxe, state())).toEqual({
      level: 3,
      reason: 'Reach level 3',
    });
    expect(recipeLock(CRAFTING_RECIPES.ironPickaxe, state({ level: 3 }))).toBeNull();
    expect(recipeLock(CRAFTING_RECIPES.crystalSword, state({ level: 9 }))?.level).toBe(10);
  });

  it('unlocks buildings by settlement milestones', () => {
    expect(buildingLock('wooden_shelter', state())).toBeNull();
    expect(buildingLock('farm_plot', state())).toBeNull();
    expect(buildingLock('storage_shed', state())?.reason).toMatch(/campfire/);
    expect(buildingLock('storage_shed', state({ center: [0, 0, 0] }))).toBeNull();
    expect(buildingLock('stone_house', state({ settlers: 1 }))).toEqual({
      reason: 'Have 3 settlers',
      progress: '1/3 settlers',
    });
    expect(buildingLock('stone_house', state({ settlers: 3 }))).toBeNull();
    expect(buildingLock('watchtower', state())?.reason).toBe('Close a rift');
    expect(buildingLock('watchtower', state({ closed: 1 }))).toBeNull();
    expect(buildingLock('manor', state({ settlers: 5 }))?.progress).toBe('5/6 settlers');
  });

  it('announces only what was just unlocked', () => {
    const recipes = Object.values(CRAFTING_RECIPES);
    const ids = BUILDINGS.map((b) => b.id);
    const before = unlockedIds(state({ level: 2, settlers: 2 }), recipes, ids);
    const after = unlockedIds(state({ level: 3, settlers: 3 }), recipes, ids);
    const notes = unlockAnnouncements(before, after);
    expect(notes[0].title).toMatch(/recipes unlocked/);
    expect(notes[0].description).toContain('Iron Pickaxe');
    expect(notes.some((n) => n.description.startsWith('Stone House'))).toBe(true);
    expect(unlockAnnouncements(after, after)).toEqual([]);
  });
});
