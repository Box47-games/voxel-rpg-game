/**
 * The live settlement attractiveness score (chunk scan + store state).
 */
import { calculateAttractiveness } from '../AttractivenessCalculator';
import { BlockTypes } from '../../chunks/blockTypes';
import { CHUNK_SIZE, CHUNK_SIZE_Y } from '../../chunks/coordinates';
import {
  ATTRACT_CAMPFIRE_SCORE,
  ATTRACT_FOOD_SCORE,
  ATTRACT_FOOD_CAP,
  ATTRACT_STOCKPILE_FOOD_SCORE,
  ATTRACT_BUILDING_SCORE,
  ATTRACT_HOUSING_BONUS,
  ATTRACT_RIFT_PENALTY,
  ATTRACT_HAPPINESS_MIN_MULT,
  ATTRACT_HAPPINESS_MAX_MULT,
} from '../../../data/tuning';

const CENTER = [8, 40, 8];
const idx = (x, y, z) => x + (z << 4) + (y << 8);

/** A chunk at (0, 0) filled with natural terrain up to `groundY`. */
function terrainChunk({ groundY = 20, lastModified = 0 } = {}) {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y);
  for (let y = 0; y < groundY; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        blocks[idx(x, y, z)] = y < groundY - 3 ? BlockTypes.STONE : y < groundY - 1 ? BlockTypes.DIRT : BlockTypes.GRASS;
      }
    }
  }
  return { key: '0,0', x: 0, z: 0, blocks, lastModified };
}

function world(...chunks) {
  return { chunks: new Map(chunks.map((c) => [c.key, c])) };
}

const emptyState = { inventory: { materials: {} }, zones: [], constructionSites: [], rifts: [], settlement: { npcs: [] } };

describe('calculateAttractiveness', () => {
  test('is 0 without a center or chunk manager', () => {
    expect(calculateAttractiveness(null, world(), emptyState).score).toBe(0);
    expect(calculateAttractiveness(CENTER, null, emptyState).score).toBe(0);
  });

  test('a campfire counts once', () => {
    const chunk = terrainChunk();
    chunk.blocks[idx(4, 20, 4)] = BlockTypes.CAMPFIRE;
    expect(calculateAttractiveness(CENTER, world(chunk), emptyState).score).toBe(ATTRACT_CAMPFIRE_SCORE);
  });

  test('natural terrain in a modified chunk does not add points', () => {
    // Placing the campfire marks the chunk modified; its thousands of stone and
    // dirt blocks used to count as walls (scores in the thousands).
    const chunk = terrainChunk({ lastModified: Date.now() });
    chunk.blocks[idx(4, 20, 4)] = BlockTypes.CAMPFIRE;
    const { score } = calculateAttractiveness(CENTER, world(chunk), emptyState);
    expect(score).toBe(ATTRACT_CAMPFIRE_SCORE);
  });

  test('food in the inventory and stockpiles adds points, capped', () => {
    const chunk = terrainChunk();
    const state = {
      ...emptyState,
      inventory: { materials: { berry: 500 } },
      zones: [{ type: 'STOCKPILE', storage: { items: { vegetable: 4 } } }],
    };
    expect(calculateAttractiveness(CENTER, world(chunk), state).score)
      .toBe(ATTRACT_FOOD_CAP * ATTRACT_FOOD_SCORE + 4 * ATTRACT_STOCKPILE_FOOD_SCORE);
  });

  test('completed buildings add points, plus a bonus per bed; unfinished ones do not', () => {
    const state = {
      ...emptyState,
      constructionSites: [
        { buildingId: 'wooden_shelter', status: 'COMPLETE' },
        { buildingId: 'wooden_shelter', status: 'BUILDING' },
      ],
    };
    expect(calculateAttractiveness(CENTER, world(terrainChunk()), state).score)
      .toBe(ATTRACT_BUILDING_SCORE + 1 * ATTRACT_HOUSING_BONUS);
  });

  test('rifts within range subtract points, never below 0', () => {
    const chunk = terrainChunk();
    chunk.blocks[idx(4, 20, 4)] = BlockTypes.CAMPFIRE;
    const near = { ...emptyState, rifts: [{ x: 20, z: 8 }] };
    const far = { ...emptyState, rifts: [{ x: 900, z: 900 }] };
    expect(calculateAttractiveness(CENTER, world(chunk), near).score).toBe(ATTRACT_CAMPFIRE_SCORE + ATTRACT_RIFT_PENALTY);
    expect(calculateAttractiveness(CENTER, world(chunk), far).score).toBe(ATTRACT_CAMPFIRE_SCORE);
    const many = { ...emptyState, rifts: [{ x: 20, z: 8 }, { x: 8, z: 20 }, { x: 0, z: 0 }] };
    expect(calculateAttractiveness(CENTER, world(terrainChunk()), many).score).toBe(0);
  });

  test('settler happiness scales the score', () => {
    const chunk = terrainChunk();
    chunk.blocks[idx(4, 20, 4)] = BlockTypes.CAMPFIRE;
    const at = (happiness) => calculateAttractiveness(CENTER, world(chunk), {
      ...emptyState, settlement: { npcs: [{ happiness }] },
    }).score;
    expect(at(0)).toBe(Math.round(ATTRACT_CAMPFIRE_SCORE * ATTRACT_HAPPINESS_MIN_MULT));
    expect(at(100)).toBe(Math.round(ATTRACT_CAMPFIRE_SCORE * ATTRACT_HAPPINESS_MAX_MULT));
  });
});
