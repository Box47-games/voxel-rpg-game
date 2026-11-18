import { BlockTypes } from '../../chunks/blockTypes';
import { findPath, standLevel, canWalkStraight, PathFollower, resetSearchBudget } from '../gridPath';

// A flat world: ground (stone) at voxel y 0..4, feet at level 5 (world y 10)
function flatWorld(size = 30) {
  const blocks = new Map();
  const k = (x, y, z) => `${x},${y},${z}`;
  const vv = (w) => Math.floor(w / 2);
  const world = {
    getBlock: (x, y, z) => {
      const vx = vv(x), vy = vv(y), vz = vv(z);
      const b = blocks.get(k(vx, vy, vz));
      if (b !== undefined) return b;
      return vy <= 4 && Math.abs(vx) < size && Math.abs(vz) < size ? BlockTypes.STONE : BlockTypes.AIR;
    },
    set: (vx, vy, vz, t) => blocks.set(k(vx, vy, vz), t),
  };
  return world;
}
const at = (vx, vz, vy = 5) => [vx * 2 + 1, vy * 2, vz * 2 + 1];
/** A wall along x = vx from z0..z1, `h` blocks tall */
const wall = (w, vx, z0, z1, h = 2) => { for (let z = z0; z <= z1; z++) for (let y = 5; y < 5 + h; y++) w.set(vx, y, z, BlockTypes.STONE); };

describe('standLevel', () => {
  test('one block up is a step, two is a wall; drops up to three', () => {
    const w = flatWorld();
    w.set(3, 5, 0, BlockTypes.STONE);
    expect(standLevel(w, 3, 0, 5)).toBe(6);
    w.set(4, 5, 0, BlockTypes.STONE); w.set(4, 6, 0, BlockTypes.STONE);
    expect(standLevel(w, 4, 0, 5)).toBeNull();
    expect(standLevel(w, 0, 0, 8)).toBe(5); // three down
    expect(standLevel(w, 0, 0, 9)).toBeNull(); // four is too far
  });

  test('no room for the head under a low ceiling', () => {
    const w = flatWorld();
    w.set(2, 6, 0, BlockTypes.STONE);
    expect(standLevel(w, 2, 0, 5)).toBeNull();
  });
});

describe('findPath', () => {
  beforeEach(resetSearchBudget);

  test('goes round a wall instead of into it', () => {
    const w = flatWorld();
    wall(w, 5, -6, 6);
    const r = findPath(w, at(0, 0), at(10, 0));
    expect(r.complete).toBe(true);
    // Every leg is walkable, and the path detours past the wall's end
    let prev = at(0, 0);
    for (const p of r.points) { expect(canWalkStraight(w, prev, p)).toBe(true); prev = p; }
    expect(Math.max(...r.points.map((p) => Math.abs(p[2])))).toBeGreaterThan(12);
  });

  test('an open field is a straight line', () => {
    const r = findPath(flatWorld(), at(0, 0), at(10, 7));
    expect(r.points).toHaveLength(1);
  });

  test('steps up a one-block ledge; walled in, it gets as close as it can', () => {
    const w = flatWorld();
    for (let z = -20; z <= 20; z++) for (let x = 6; x <= 12; x++) w.set(x, 5, z, BlockTypes.STONE);
    const up = findPath(w, at(0, 0), at(9, 0, 6));
    expect(up.complete).toBe(true);
    expect(up.points.at(-1)[1]).toBe(12);

    const boxed = flatWorld();
    wall(boxed, 3, -3, 3); wall(boxed, -3, -3, 3);
    for (let x = -3; x <= 3; x++) { boxed.set(x, 5, 3, BlockTypes.STONE); boxed.set(x, 6, 3, BlockTypes.STONE); boxed.set(x, 5, -3, BlockTypes.STONE); boxed.set(x, 6, -3, BlockTypes.STONE); }
    const r = findPath(boxed, at(0, 0), at(10, 0));
    expect(r.complete).toBe(false);
    expect(r.points.at(-1)[0]).toBe(at(2, 0)[0]); // the wall nearest the goal
  });
});

describe('PathFollower', () => {
  beforeEach(resetSearchBudget);

  test('heads straight when it can, round the wall when it can\'t, and re-plans when stuck', () => {
    const w = flatWorld();
    const f = new PathFollower();
    f.setGoal(at(10, 0));
    expect(f.next(w, at(0, 0), 0)).toEqual(at(10, 0));

    wall(w, 5, -6, 6);
    const g = new PathFollower();
    g.setGoal(at(10, 0));
    const first = g.next(w, at(0, 0), 0);
    expect(Math.abs(first[2])).toBeGreaterThan(10); // off to the wall's end

    // Not moving for a while: a fresh plan
    g.next(w, at(0, 0), 1);
    g.next(w, at(0, 0), 3);
    expect(g.stuck).toBe(true);
  });
});
