/**
 * CampfireDetector.test.js — Tests for campfire scanning and terrain Y lookup.
 */

import { scanChunkForCampfire, getTerrainYAt } from '../CampfireDetector';

// Mock blockTypes module
vi.mock('../../../systems/chunks/blockTypes', () => ({
  BlockTypes: { CAMPFIRE: 42, STONE: 1, AIR: 0 },
  isSolid: (block) => block === 1, // only STONE is solid
}));

vi.mock('../../../systems/chunks/coordinates', () => ({
  CHUNK_SIZE: 16,
  CHUNK_SIZE_Y: 64,
  VOXEL_SIZE: 2,
}));

function makeChunkAdapter(chunks, getBlockFn) {
  return {
    iterateChunks: () => chunks[Symbol.iterator](),
    getBlock: getBlockFn || (() => 0),
  };
}

function makeEmptyBlocks() {
  return new Uint8Array(16 * 16 * 64); // all zeros (AIR)
}

describe('scanChunkForCampfire', () => {
  test('returns null when the chunk has no campfire', () => {
    expect(scanChunkForCampfire({ x: 0, z: 0, blocks: makeEmptyBlocks() })).toBeNull();
  });

  test('returns correct world position when campfire found', () => {
    const blocks = makeEmptyBlocks();
    // Place campfire at local x=2, z=3, y=5 in chunk (0,0)
    blocks[2 + (3 << 4) + (5 << 8)] = 42; // CAMPFIRE
    // wx = (0*16 + 2) * 2 + 1 = 5; wy = 5 * 2 + 1 = 11; wz = (0*16 + 3) * 2 + 1 = 7
    expect(scanChunkForCampfire({ x: 0, z: 0, blocks })).toEqual([5, 11, 7]);
  });

  test('offsets by the chunk position', () => {
    const blocks = makeEmptyBlocks();
    blocks[1 + (1 << 4) + (2 << 8)] = 42;
    // wx = (1*16 + 1) * 2 + 1 = 35; wy = 2 * 2 + 1 = 5; wz = (-1*16 + 1) * 2 + 1 = -29
    expect(scanChunkForCampfire({ x: 1, z: -1, blocks })).toEqual([35, 5, -29]);
  });

  test('returns the lowest campfire when a chunk has several', () => {
    const blocks = makeEmptyBlocks();
    blocks[4 + (4 << 4) + (9 << 8)] = 42;
    blocks[0 + (0 << 4) + (1 << 8)] = 42;
    expect(scanChunkForCampfire({ x: 0, z: 0, blocks })).toEqual([1, 3, 1]);
  });

  test('handles a chunk with null blocks, or no chunk at all', () => {
    expect(scanChunkForCampfire({ x: 0, z: 0, blocks: null })).toBeNull();
    expect(scanChunkForCampfire(undefined)).toBeNull();
  });
});

describe('getTerrainYAt', () => {
  test('returns Y above highest solid block', () => {
    // Solid block at vy=4, air above
    const adapter = makeChunkAdapter([], (wx, wy, wz) => {
      // vy=4 → worldY = 4*2+1 = 9
      if (wy === 9) return 1; // STONE
      return 0; // AIR
    });
    const y = getTerrainYAt(adapter, 10, 10);
    // (4+1) * 2 = 10
    expect(y).toBe(10);
  });

  test('returns fallback 2 when no solid blocks', () => {
    const adapter = makeChunkAdapter([], () => 0);
    expect(getTerrainYAt(adapter, 10, 10)).toBe(2);
  });
});
