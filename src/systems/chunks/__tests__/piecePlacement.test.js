/**
 * Placing pieces: aiming on the half-block grid, where each piece goes, what
 * fits in a cell, and that placing then mining is never a gain or a loss.
 */
import { ChunkManager } from '../ChunkManager';
import { BlockTypes } from '../blockTypes';
import { shapes as SHAPE, AXIS, cellPieces, shapeAxis, shapeKind, SHAPE_KIND } from '../cellShape';
import { raycastUnits, planPiece, applyPiece, boxesOverlap, rotationCount } from '../piecePlacement';
import { minePiece } from '../pieceMining';

async function settle(cm) {
  cm.updatePlayerPosition(0, 0);
  for (let i = 0; i < 60; i++) {
    cm.update(0.016);
    await Promise.resolve();
  }
}

// A stone floor block at cell (2, 25, 2) (world 4..6, 50..52, 4..6) in open air
const FLOOR = [5, 51, 5];
const solid = (cm) => (x, y, z) => cm.isSolidAt(x, y, z);
// The hit of a ray straight down onto the floor's top, at the unit (ux, uz) of its top face
const topHit = (ux, uz) => ({ unit: [ux, 51, uz], normal: [0, 1, 0] });
const sideHit = (uy, uz) => ({ unit: [5, uy, uz], normal: [1, 0, 0] }); // east face of the floor

describe('piece placement', () => {
  let cm;
  beforeEach(async () => {
    cm = new ChunkManager({ seed: 1, viewDistance: 1 });
    await settle(cm);
    for (let x = 1; x < 16; x += 2) for (let y = 53; y < 64; y += 2) for (let z = 1; z < 16; z += 2) cm.setBlock(x, y, z, 0);
    for (let x = 1; x < 16; x += 2) for (let z = 1; z < 16; z += 2) cm.setBlock(x, 51, z, 0);
    cm.setBlock(...FLOOR, BlockTypes.STONE);
  });

  it('raycastUnits finds the unit hit and the face entered', () => {
    const hit = raycastUnits(solid(cm), { x: 4.5, y: 60, z: 5.5 }, { x: 0, y: -1, z: 0 }, 20);
    expect(hit).toEqual({ unit: [4, 51, 5], normal: [0, 1, 0] });
    const side = raycastUnits(solid(cm), { x: 9, y: 50.5, z: 4.5 }, { x: -1, y: 0, z: 0 }, 20);
    expect(side).toEqual({ unit: [5, 50, 4], normal: [1, 0, 0] });
    // Through the empty half of a slab to what's under it
    cm.setCell(5, 53, 5, BlockTypes.STONE, SHAPE.slab(AXIS.X, [1])); // wall slab on the x+ half
    const past = raycastUnits(solid(cm), { x: 4.5, y: 60, z: 4.5 }, { x: 0, y: -1, z: 0 }, 20);
    expect(past.unit).toEqual([4, 51, 4]);
  });

  it('a slab aimed at a top face lies flat on it; turning stands it up', () => {
    const flat = planPiece(cm, 'stone_slab', topHit(4, 4));
    expect(flat.ok).toBe(true);
    expect(flat.cells).toHaveLength(1);
    expect(flat.cells[0].center).toEqual([5, 53, 5]);
    expect(flat.cells[0].shape).toBe(SHAPE.slab(AXIS.Y, [0]));
    const upright = planPiece(cm, 'stone_slab', topHit(5, 4), { rotation: 1 });
    expect(upright.cells[0].shape).toBe(SHAPE.slab(AXIS.Z, [0]));
    const other = planPiece(cm, 'stone_slab', topHit(5, 4), { rotation: 2 });
    expect(other.cells[0].shape).toBe(SHAPE.slab(AXIS.X, [1]));
  });

  it('a slab aimed at a side face hugs that face', () => {
    const p = planPiece(cm, 'stone_slab', sideHit(50, 4));
    expect(p.cells[0].center).toEqual([7, 51, 5]);
    expect(p.cells[0].shape).toBe(SHAPE.slab(AXIS.X, [0]));
  });

  it('two slabs in one cell stay two slabs', () => {
    applyPiece(cm, planPiece(cm, 'stone_slab', topHit(4, 4)));
    // Aim at the top of that slab: the second goes in the upper half of the same cell
    const second = planPiece(cm, 'stone_slab', { unit: [4, 52, 4], normal: [0, 1, 0] });
    expect(second.ok).toBe(true);
    applyPiece(cm, second);
    const shape = cm.getShape(5, 53, 5);
    expect(shape).toBe(SHAPE.slab(AXIS.Y, [0, 1]));
    expect(cellPieces(shape)).toHaveLength(2);
    expect(cm.getBlock(5, 53, 5)).toBe(BlockTypes.STONE);
  });

  it('pieces of another kind, axis or material do not go in a cell', () => {
    applyPiece(cm, planPiece(cm, 'stone_slab', topHit(4, 4)));
    const wall = planPiece(cm, 'stone_slab', { unit: [4, 52, 4], normal: [0, 1, 0] }, { rotation: 1 });
    expect(wall.ok).toBe(false);
    const dirt = planPiece(cm, 'dirt_cube', { unit: [4, 52, 4], normal: [0, 1, 0] });
    expect(dirt.ok).toBe(false);
    expect(dirt.reason).toMatch(/One material/);
    const intoBlock = planPiece(cm, 'stone_slab', { unit: [4, 49, 4], normal: [0, 1, 0] });
    expect(intoBlock.ok).toBe(false);
  });

  it('cubes fill a cell one unit at a time', () => {
    for (const [ux, uz] of [[4, 4], [5, 4], [4, 5]]) applyPiece(cm, planPiece(cm, 'dirt_cube', topHit(ux, uz)));
    const shape = cm.getShape(5, 53, 5);
    expect(shapeKind(shape)).toBe(SHAPE_KIND.CUBES);
    expect(cellPieces(shape)).toHaveLength(3);
  });

  it('a plank runs the way you look, over two cells, toward the side aimed at', () => {
    const p = planPiece(cm, 'wood_plank', topHit(5, 4), { lookAxis: AXIS.X });
    expect(p.ok).toBe(true);
    expect(p.cells.map((c) => c.center)).toEqual([[5, 53, 5], [7, 53, 5]]);
    applyPiece(cm, p);
    expect(shapeAxis(cm.getShape(5, 53, 5))).toBe(AXIS.X);
    // Mining either half gives the one plank back and clears both cells
    const mined = minePiece(cm, { x: 6.5, y: 52.5, z: 4.5 });
    expect(mined.drops).toEqual([{ material: 'wood_plank', amount: 1 }]);
    expect(cm.getBlock(5, 53, 5)).toBe(0);
    expect(cm.getBlock(7, 53, 5)).toBe(0);
  });

  it('turning a plank: across, then upright', () => {
    const across = planPiece(cm, 'wood_plank', topHit(4, 4), { lookAxis: AXIS.X, rotation: 1 });
    expect(across.cells.map((c) => c.center)).toEqual([[5, 53, 5], [5, 53, 3]]);
    const up = planPiece(cm, 'wood_plank', topHit(4, 4), { lookAxis: AXIS.X, rotation: 2 });
    expect(up.boxes.map((b) => b.min)).toEqual([[4, 52, 4], [4, 50, 4]]);
    expect(up.ok).toBe(false); // the lower half would go into the floor block
    const upHigh = planPiece(cm, 'wood_plank', { unit: [4, 53, 4], normal: [0, 1, 0] }, { lookAxis: AXIS.X, rotation: 2 });
    expect(upHigh.ok).toBe(true);
    expect(upHigh.cells.map((c) => c.center)).toEqual([[5, 55, 5], [5, 53, 5]]); // aimed at the low unit: it reaches down
  });

  it('placing then mining gives back exactly what was spent', () => {
    for (const [key, hit] of [['stone_slab', topHit(4, 4)], ['dirt_cube', topHit(5, 5)], ['wood_plank', topHit(4, 5)]]) {
      const plan = planPiece(cm, key, hit, { lookAxis: AXIS.Z });
      expect(applyPiece(cm, plan)).toBe(true);
      const [cx, cy, cz] = plan.cells[0].center;
      const box = plan.boxes[0];
      const point = { x: (box.min[0] + box.max[0]) / 2, y: (box.min[1] + box.max[1]) / 2, z: (box.min[2] + box.max[2]) / 2 };
      expect(minePiece(cm, point).drops).toEqual([{ material: key, amount: 1 }]);
      expect(cm.getBlock(cx, cy, cz)).toBe(0);
    }
  });

  it('boxes are in world units and overlap tests work', () => {
    const p = planPiece(cm, 'stone_slab', topHit(4, 4));
    expect(p.boxes[0]).toEqual({ min: [4, 52, 4], max: [6, 53, 6] });
    expect(boxesOverlap(p.boxes, [4.5, 52.5, 4.5], [5, 55, 5])).toBe(true);
    expect(boxesOverlap(p.boxes, [4.5, 53, 4.5], [5, 55, 5])).toBe(false);
  });

  it('cubes have one orientation, slabs and planks three', () => {
    expect(rotationCount('dirt_cube')).toBe(1);
    expect(rotationCount('stone_slab')).toBe(3);
    expect(rotationCount('wood_plank')).toBe(3);
    expect(rotationCount('stone')).toBe(1);
  });
});
