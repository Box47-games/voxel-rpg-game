import { findNearestNPC } from '../npcQueries';

const npc = (id, x, z) => ({ id, position: [x, 10, z] });

describe('findNearestNPC', () => {
  test('returns the closest NPC within range, ignoring height', () => {
    const npcs = [npc('far', 3, 0), npc('near', 0, 2), npc('out', 10, 10)];
    expect(findNearestNPC(npcs, [0, 0, 0], 4).id).toBe('near');
  });

  test('returns null when nobody is in range or the list is empty', () => {
    expect(findNearestNPC([npc('a', 5, 0)], [0, 0, 0], 4)).toBeNull();
    expect(findNearestNPC([], [0, 0, 0], 4)).toBeNull();
  });

  test('includes NPCs exactly at the range and skips ones without a position', () => {
    expect(findNearestNPC([{ id: 'x' }, npc('edge', 4, 0)], [0, 0, 0], 4).id).toBe('edge');
  });
});
