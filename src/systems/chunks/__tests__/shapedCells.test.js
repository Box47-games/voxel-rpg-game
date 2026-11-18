/**
 * Shaped cells (pieces) in the world: ChunkManager storage, point solidity,
 * standing height, unload/reload, and mining one piece at a time.
 */
import { ChunkManager } from '../ChunkManager';
import { BlockTypes } from '../blockTypes';
import { shapes as SHAPE, AXIS, cellPieces } from '../cellShape';
import { minePiece, targetPiece } from '../pieceMining';

async function settle(cm, x, z, frames = 60) {
  cm.updatePlayerPosition(x, z);
  for (let i = 0; i < frames; i++) {
    cm.update(0.016);
    await Promise.resolve();
  }
}

// A cell high above the terrain (y cell 28: world 56..58), so it is open air around
const Y = 57;

describe('shaped cells in ChunkManager', () => {
  let cm;
  beforeEach(async () => {
    cm = new ChunkManager({ seed: 1, viewDistance: 2 });
    await settle(cm, 0, 0);
  });

  it('stores a shape and keeps the block type readable', () => {
    const slab = SHAPE.slab(AXIS.Y, [0]);
    expect(cm.setCell(5, Y, 5, BlockTypes.STONE, slab)).toBe(true);
    expect(cm.getBlock(5, Y, 5)).toBe(BlockTypes.STONE);
    expect(cm.getShape(5, Y, 5)).toBe(slab);
    expect(cm.setCell(5, Y, 5, BlockTypes.STONE, slab)).toBe(false); // no change
  });

  it('setBlock makes a full block again', () => {
    cm.setCell(5, Y, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    expect(cm.setBlock(5, Y, 5, BlockTypes.STONE)).toBe(true);
    expect(cm.getShape(5, Y, 5)).toBe(0);
  });

  it('isSolidAt only counts filled sub-cubes', () => {
    cm.setCell(5, Y, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    expect(cm.isSolidAt(4.5, 56.5, 4.5)).toBe(true);
    expect(cm.isSolidAt(4.5, 57.5, 4.5)).toBe(false);
    cm.setBlock(9, Y, 9, BlockTypes.STONE);
    expect(cm.isSolidAt(8.5, 57.5, 8.5)).toBe(true);
  });

  it('standing height: half a block on a floor slab, the cell top on a block', () => {
    const terrain = cm.standingHeight(5, 5);
    expect(terrain).toBeGreaterThan(0);
    cm.setCell(5, Y, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    expect(cm.standingHeight(5, 5)).toBe(57);
    expect(cm.standingHeight(5, 5, 56.5)).toBe(terrain); // below the slab
    cm.setCell(5, Y, 5, BlockTypes.DIRT, SHAPE.cubes(0b00000001));
    expect(cm.standingHeight(4.5, 4.5)).toBe(57); // on the cube
    expect(cm.standingHeight(5.5, 5.5)).toBe(terrain); // beside it: down to the terrain
  });

  it('shapes survive the chunk unloading and reloading', async () => {
    const cubes = SHAPE.cubes(0b01011010);
    cm.setCell(5, Y, 5, BlockTypes.SAND, cubes);
    await settle(cm, 5000, 5000);
    expect(cm.getChunk(0, 0)).toBeUndefined();
    await settle(cm, 0, 0);
    expect(cm.getShape(5, Y, 5)).toBe(cubes);
    expect(cm.getModifiedChunks().find((c) => c.key === '0,0').shapes).toBeInstanceOf(Uint16Array);
  });

  it('mining a slab removes only the hit slab and gives one slab back', () => {
    cm.setCell(5, Y, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0, 1]));
    const hit = minePiece(cm, { x: 4.5, y: 57.5, z: 4.5 }); // top half
    expect(hit.drops).toEqual([{ material: 'stone_slab', amount: 1 }]);
    expect(cm.getShape(5, Y, 5)).toBe(SHAPE.slab(AXIS.Y, [0]));
    minePiece(cm, { x: 4.5, y: 56.5, z: 4.5 });
    expect(cm.getBlock(5, Y, 5)).toBe(BlockTypes.AIR);
    expect(cm.getShape(5, Y, 5)).toBe(0);
  });

  it('mining a cube removes one cube', () => {
    cm.setCell(5, Y, 5, BlockTypes.DIRT, SHAPE.cubes(0b11));
    const hit = minePiece(cm, { x: 5.5, y: 56.5, z: 4.5 });
    expect(hit.drops).toEqual([{ material: 'dirt_cube', amount: 1 }]);
    expect(cellPieces(cm.getShape(5, Y, 5))).toHaveLength(1);
  });

  it('mining either half of a plank removes both and gives one plank', () => {
    cm.setCell(5, Y, 5, BlockTypes.WOOD, SHAPE.plank(AXIS.X, [0], true));
    cm.setCell(7, Y, 5, BlockTypes.WOOD, SHAPE.plank(AXIS.X, [0], false));
    const hit = minePiece(cm, { x: 6.5, y: 56.5, z: 4.5 }); // the + half
    expect(hit.drops).toEqual([{ material: 'wood_plank', amount: 1 }]);
    expect(cm.getBlock(5, Y, 5)).toBe(BlockTypes.AIR);
    expect(cm.getBlock(7, Y, 5)).toBe(BlockTypes.AIR);
  });

  it('a lone plank half gives nothing (it is not a whole plank)', () => {
    cm.setCell(5, Y, 5, BlockTypes.WOOD, SHAPE.plank(AXIS.X, [0], true));
    expect(minePiece(cm, { x: 4.5, y: 56.5, z: 4.5 }).drops).toEqual([]);
  });

  it('plain blocks and empty parts are not pieces', () => {
    cm.setBlock(5, Y, 5, BlockTypes.STONE);
    expect(minePiece(cm, { x: 4.5, y: 56.5, z: 4.5 })).toBeNull();
    cm.setCell(5, Y, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    expect(targetPiece(cm, { x: 4.5, y: 57.5, z: 4.5 })).toBeNull();
  });
});
