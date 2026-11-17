import { withinTouchReach } from '../BlockInteraction';

// Player standing on the voxel at (0..2, 10..12, 0..2); blocks are given by their centre
const player = [1, 10, 1];
const block = (vx, vy, vz) => ({ x: vx * 2 + 1, y: vy * 2 + 1, z: vz * 2 + 1 });

describe('touch reach: four blocks', () => {
  test('blocks up to four away (on the grid) are in reach', () => {
    expect(withinTouchReach(player, block(4, 5, 0))).toBe(true);
    expect(withinTouchReach(player, block(-4, 5, 4))).toBe(true);
    expect(withinTouchReach(player, block(0, 1, 0))).toBe(true); // four down
    expect(withinTouchReach(player, block(0, 10, 0))).toBe(true); // four over the head
  });

  test('five away is too far', () => {
    expect(withinTouchReach(player, block(5, 5, 0))).toBe(false);
    expect(withinTouchReach(player, block(0, 5, -5))).toBe(false);
    expect(withinTouchReach(player, block(0, 0, 0))).toBe(false);
    expect(withinTouchReach(player, block(0, 11, 0))).toBe(false);
  });
});
