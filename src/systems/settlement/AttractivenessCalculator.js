/**
 * AttractivenessCalculator — Scores how appealing the settlement is to immigrants.
 *
 * Score = campfires near the center (chunk scan) + food (inventory and
 * stockpiles) + completed buildings (with a bonus per bed) − nearby rifts,
 * scaled by settler happiness.
 *
 * It used to add points for "walls": every stone/dirt/sand/wood block in any
 * chunk the player had modified. That counted natural terrain too (placing a
 * campfire marks its chunk modified), so scores ran into the thousands and
 * every threshold was met at once. Housing now comes from beds in completed
 * buildings, which is counted below.
 */

import { BlockTypes } from '../chunks/blockTypes';
import { CHUNK_SIZE, CHUNK_SIZE_Y, VOXEL_SIZE, worldToChunk } from '../chunks/coordinates';
import {
  ATTRACT_CAMPFIRE_SCORE,
  ATTRACT_FOOD_SCORE,
  ATTRACT_FOOD_CAP,
  ATTRACT_RIFT_PENALTY,
  ATTRACT_SCAN_RADIUS,
  ATTRACT_HAPPINESS_MIN_MULT,
  ATTRACT_HAPPINESS_MAX_MULT,
  ATTRACT_STOCKPILE_FOOD_SCORE,
  ATTRACT_STOCKPILE_FOOD_CAP,
  ATTRACT_BUILDING_SCORE,
  ATTRACT_HOUSING_BONUS,
} from '../../data/tuning';
import { getBuildingById } from '../../data/buildings';

// Food materials in inventory
const FOOD_MATERIALS = ['berry', 'vegetable', 'meat'];

/**
 * Calculate settlement attractiveness score.
 * @param {number[]} center - [x, y, z] world position of settlement center
 * @param {Object} chunkManager - ChunkManager instance
 * @param {Object} gameState - Current zustand state snapshot
 * @returns {{ score: number }} Attractiveness score
 */
export function calculateAttractiveness(center, chunkManager, gameState) {
  if (!center || !chunkManager) return { score: 0 };

  const [cx, , cz] = center;
  let campfireScore = 0;

  // Convert scan radius from world units to chunk radius
  const scanChunkRadius = Math.ceil(ATTRACT_SCAN_RADIUS / (CHUNK_SIZE * VOXEL_SIZE));
  const { chunkX: centerCX, chunkZ: centerCZ } = worldToChunk(cx, cz);

  // Iterate loaded chunks within scan radius
  for (const [, chunk] of chunkManager.chunks) {
    // Check if chunk is within scan radius
    const dcx = chunk.x - centerCX;
    const dcz = chunk.z - centerCZ;
    if (Math.abs(dcx) > scanChunkRadius || Math.abs(dcz) > scanChunkRadius) continue;

    if (!chunk.blocks) continue;

    // Scan all blocks in chunk
    for (let y = 0; y < CHUNK_SIZE_Y; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const blockType = chunk.blocks[x + (z << 4) + (y << 8)];

          if (blockType === BlockTypes.CAMPFIRE) {
            campfireScore += ATTRACT_CAMPFIRE_SCORE;
          }
        }
      }
    }
  }

  // Food bonus from inventory
  let foodCount = 0;
  if (gameState.inventory?.materials) {
    for (const mat of FOOD_MATERIALS) {
      foodCount += gameState.inventory.materials[mat] || 0;
    }
  }
  const foodScore = Math.min(foodCount, ATTRACT_FOOD_CAP) * ATTRACT_FOOD_SCORE;

  // Rift penalty
  let riftPenalty = 0;
  if (gameState.rifts) {
    for (const rift of gameState.rifts) {
      const dx = rift.x - cx;
      const dz = rift.z - cz;
      const dist = Math.sqrt(dx * dx + dz * dz);
      if (dist <= ATTRACT_SCAN_RADIUS) {
        riftPenalty += ATTRACT_RIFT_PENALTY;
      }
    }
  }

  // Stockpile food bonus
  let stockpileFoodCount = 0;
  if (gameState.zones) {
    for (const zone of gameState.zones) {
      if (zone.type === 'STOCKPILE' && zone.storage?.items) {
        for (const mat of FOOD_MATERIALS) {
          stockpileFoodCount += zone.storage.items[mat] || 0;
        }
      }
    }
  }
  const stockpileFoodScore = Math.min(stockpileFoodCount, ATTRACT_STOCKPILE_FOOD_CAP) * ATTRACT_STOCKPILE_FOOD_SCORE;

  // Completed building bonus
  let buildingScore = 0;
  if (gameState.constructionSites) {
    for (const site of gameState.constructionSites) {
      if (site.status !== 'COMPLETE') continue;
      const bld = getBuildingById(site.buildingId);
      if (!bld) continue;
      buildingScore += ATTRACT_BUILDING_SCORE;
      if (bld.effects.housing) {
        buildingScore += bld.effects.housing * ATTRACT_HOUSING_BONUS;
      }
    }
  }

  let baseScore = campfireScore + foodScore + stockpileFoodScore + buildingScore + riftPenalty;

  // Happiness multiplier: if NPCs exist, scale by average happiness
  const npcs = gameState.settlement?.npcs;
  if (npcs && npcs.length > 0) {
    let totalHappiness = 0;
    for (const npc of npcs) {
      totalHappiness += npc.happiness ?? 65;
    }
    const avgHappiness = totalHappiness / npcs.length;
    const t = Math.max(0, Math.min(1, avgHappiness / 100));
    const mult = ATTRACT_HAPPINESS_MIN_MULT + t * (ATTRACT_HAPPINESS_MAX_MULT - ATTRACT_HAPPINESS_MIN_MULT);
    baseScore *= mult;
  }

  return { score: Math.max(0, Math.round(baseScore)) };
}
