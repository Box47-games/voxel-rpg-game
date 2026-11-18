import { ChunkManager } from '../../chunks/ChunkManager';
import { BlockTypes } from '../../chunks/blockTypes';
import { shapes as SHAPE, AXIS } from '../../chunks/cellShape';
import { stepUpAhead } from '../stepUp';

async function settle(cm) {
  cm.updatePlayerPosition(0, 0);
  for (let i = 0; i < 60; i++) {
    cm.update(0.016);
    await Promise.resolve();
  }
}

describe('stepUpAhead', () => {
  let cm;
  // Player standing on a stone floor at y = 50, walking +x
  const pos = { x: 5.5, y: 50, z: 5 };
  beforeEach(async () => {
    cm = new ChunkManager({ seed: 1, viewDistance: 1 });
    await settle(cm);
    // Open air above a stone floor (terrain can reach this high)
    for (let x = 1; x < 14; x += 2) {
      cm.setBlock(x, 49, 5, BlockTypes.STONE);
      for (let y = 51; y < 64; y += 2) cm.setBlock(x, y, 5, BlockTypes.AIR);
    }
  });

  it('steps onto a floor slab ahead', () => {
    cm.setCell(7, 51, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    expect(stepUpAhead(cm, pos, 1, 0)).toBe(51);
  });

  it('a full block is a jump, not a step', () => {
    cm.setBlock(7, 51, 5, BlockTypes.STONE);
    expect(stepUpAhead(cm, pos, 1, 0)).toBeNull();
  });

  it('a top slab (ceiling) is not a step', () => {
    cm.setCell(7, 51, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [1]));
    expect(stepUpAhead(cm, pos, 1, 0)).toBeNull();
  });

  it('no step without headroom above it', () => {
    cm.setCell(7, 51, 5, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
    cm.setBlock(7, 53, 5, BlockTypes.STONE);
    expect(stepUpAhead(cm, pos, 1, 0)).toBeNull();
  });

  it('nothing ahead: no step', () => {
    expect(stepUpAhead(cm, pos, 1, 0)).toBeNull();
  });
});
