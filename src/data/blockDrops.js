/**
 * blockDrops.js — Defines what materials drop when blocks are mined
 *
 * Format: BlockType → { material, min, max, chance?, bonus?, requiresTier? }
 *   - material: key in inventory.materials
 *   - min/max: quantity range (random)
 *   - chance: probability of dropping (default 1.0)
 *   - bonus: additional rare drop { material, amount, chance }
 *   - requiresTier: minimum TOOL_TIER to get drops (block still breaks without it)
 *   - pieces: true — a building material: drops its pieces (planks, slabs,
 *     cubes; data/pieces.js) by tool yield instead of min/max
 */

import { BlockTypes } from '../systems/chunks/blockTypes';
import { TOOL_TIER, APPLE_DROP_CHANCE } from './tuning';
import { PIECES, piecesFromMining, blocksAvailable, spendByVolume, isPieceKey } from './pieces';

export const BLOCK_DROPS = {
  [BlockTypes.STONE]: { material: 'stone', pieces: true },
  [BlockTypes.DIRT]: { material: 'dirt', pieces: true },
  [BlockTypes.GRASS]: { material: 'dirt', pieces: true },
  [BlockTypes.SAND]: { material: 'sand', pieces: true },
  [BlockTypes.WOOD]: { material: 'wood', pieces: true },
  [BlockTypes.LEAVES]: {
    material: null, // No primary drop
    min: 0,
    max: 0,
    bonus: { material: 'berry', amount: 1, chance: APPLE_DROP_CHANCE },
  },
  [BlockTypes.GRAVEL]: { material: 'stone', pieces: true },
  [BlockTypes.COAL_ORE]: {
    material: 'coal',
    min: 1,
    max: 3,
    requiresTier: TOOL_TIER.STONE,
  },
  [BlockTypes.IRON_ORE]: {
    material: 'iron',
    min: 1,
    max: 1,
    requiresTier: TOOL_TIER.IRON,
  },
  [BlockTypes.GOLD_ORE]: {
    material: 'gold_ore',
    min: 1,
    max: 1,
    requiresTier: TOOL_TIER.IRON,
  },
  [BlockTypes.CLAY]: { material: 'clay', pieces: true },
  [BlockTypes.SNOW]: { material: 'snow', pieces: true },
  [BlockTypes.ICE]: { material: 'ice', min: 1, max: 1 },
  [BlockTypes.BERRY_BUSH]: { material: 'berry', min: 1, max: 3 },
  [BlockTypes.CAMPFIRE]: { material: 'wood', min: 2, max: 2 },
  [BlockTypes.CORRUPTED_STONE]: { material: 'stone', pieces: true },
  [BlockTypes.CORRUPTED_GRASS]: { material: 'dirt', pieces: true },
};

/**
 * Calculate drops for a mined block.
 * @param {number} blockType - The block type that was mined
 * @param {number} toolTier - The tier of the tool used (0 = bare hands); gates ores
 * @param {{pickaxe: number, axe: number}} [pieceTiers] - Tool tiers for piece
 *   yields (pickaxe for stone, axe for wood; data/pieces.js pieceTiers). Defaults
 *   to toolTier for both.
 * @returns {Array<{material: string, amount: number}>} drops
 */
export function calculateDrops(blockType, toolTier = 0, pieceTiers = null) {
  const dropDef = BLOCK_DROPS[blockType];
  if (!dropDef) return [];

  const drops = [];

  // Building materials break into pieces; the right tool keeps more of the block
  if (dropDef.pieces) {
    const piece = PIECES[dropDef.material];
    const tier = piece.tool ? (pieceTiers ? pieceTiers[piece.tool] : toolTier) : toolTier;
    const count = piecesFromMining(dropDef.material, tier);
    if (count > 0) drops.push({ material: piece.key, amount: count });
    return drops;
  }

  // Check tool tier requirement
  if (dropDef.requiresTier && toolTier < dropDef.requiresTier) {
    // Block breaks but yields nothing without the right tool
    return [];
  }

  // Primary drop
  if (dropDef.material && dropDef.max > 0) {
    const amount = dropDef.min === dropDef.max
      ? dropDef.min
      : dropDef.min + Math.floor(Math.random() * (dropDef.max - dropDef.min + 1));
    if (amount > 0) {
      drops.push({ material: dropDef.material, amount });
    }
  }

  // Bonus drop (random chance)
  if (dropDef.bonus) {
    if (Math.random() < dropDef.bonus.chance) {
      drops.push({ material: dropDef.bonus.material, amount: dropDef.bonus.amount });
    }
  }

  return drops;
}

/**
 * Materials consumed when PLACING a block (Build mode).
 * Mirrors what mining the block yields so placing then mining is never a
 * net gain. Blocks not listed here cannot be placed from the hotbar.
 */
export const BLOCK_PLACEMENT_COSTS = {
  [BlockTypes.DIRT]: { dirt: 1 },
  [BlockTypes.GRASS]: { dirt: 1 },
  [BlockTypes.STONE]: { stone: 1 },
  [BlockTypes.SAND]: { sand: 1 },
  [BlockTypes.SNOW]: { snow: 1 },
  [BlockTypes.WOOD]: { wood: 1 },
  [BlockTypes.GRAVEL]: { stone: 1 },
  [BlockTypes.COAL_ORE]: { coal: 1 },
  [BlockTypes.CLAY]: { clay: 1 },
  [BlockTypes.ICE]: { ice: 1 },
  [BlockTypes.CAMPFIRE]: { wood: 2 },
};

/**
 * Placements paid by volume (planks, slabs and cubes count). Every other block
 * takes a real block of its material: pieces combine into blocks only by
 * crafting (data/pieces.js).
 */
const PLACE_BY_VOLUME = new Set([BlockTypes.CAMPFIRE]);

/** Does placing this block accept pieces (by volume)? */
export const placementByVolume = (blockType) => PLACE_BY_VOLUME.has(blockType);

/** How much of `mat` counts toward placing `blockType`. */
const have = (blockType, materials, mat) =>
  placementByVolume(blockType) ? blocksAvailable(materials, mat) : materials?.[mat] || 0;

/**
 * Get the material cost for placing a block, or null if it can't be placed.
 * @param {number} blockType
 * @returns {Object<string, number>|null}
 */
export function getPlacementCost(blockType) {
  return BLOCK_PLACEMENT_COSTS[blockType] || null;
}

/**
 * Materials that are a placeable block of their own: what a hotbar slot
 * holding that material places. (Grass, gravel, coal ore and the campfire
 * are picked from the Build catalog.)
 */
export const MATERIAL_BLOCK = {
  wood: BlockTypes.WOOD,
  stone: BlockTypes.STONE,
  dirt: BlockTypes.DIRT,
  sand: BlockTypes.SAND,
  snow: BlockTypes.SNOW,
  clay: BlockTypes.CLAY,
  ice: BlockTypes.ICE,
};

/** Block a hotbar slot holding `key` places, or null (a piece key: see heldPiece in the store). */
export const blockForMaterial = (key) => MATERIAL_BLOCK[key] ?? null;

/** Can this material go in a hotbar slot? Blocks and pieces. */
export const hotbarAllows = (key) => key in MATERIAL_BLOCK || isPieceKey(key);

/** Every block type the player can place, in catalog order. */
export const PLACEABLE_BLOCKS = Object.keys(BLOCK_PLACEMENT_COSTS).map(Number);

/**
 * How many of a block the player can afford to place right now.
 * @param {number} blockType
 * @param {Object<string, number>} materials - inventory.materials
 * @returns {number}
 */
export function countPlaceable(blockType, materials) {
  const cost = getPlacementCost(blockType);
  if (!cost) return 0;
  let count = Infinity;
  for (const [mat, qty] of Object.entries(cost)) {
    count = Math.min(count, Math.floor(have(blockType, materials, mat) / qty + 1e-9));
  }
  return Number.isFinite(count) ? count : 0;
}

/**
 * Check whether an inventory can pay a placement cost.
 * @param {Object<string, number>} materials - inventory.materials
 * @param {Object<string, number>} cost
 * @returns {{ ok: boolean, missing: string|null }}
 */
export function canAffordPlacement(materials, cost, blockType = null) {
  if (!cost) return { ok: false, missing: null };
  for (const [mat, qty] of Object.entries(cost)) {
    if (have(blockType, materials, mat) < qty - 1e-9) return { ok: false, missing: mat };
  }
  return { ok: true, missing: null };
}

/**
 * Materials after paying to place `blockType`, or null if short.
 * @param {number} blockType
 * @param {Object<string, number>} materials
 */
export function payPlacement(blockType, materials) {
  const cost = getPlacementCost(blockType);
  if (!cost || !canAffordPlacement(materials, cost, blockType).ok) return null;
  if (placementByVolume(blockType)) return spendByVolume(materials, cost);
  const next = { ...materials };
  for (const [mat, qty] of Object.entries(cost)) next[mat] -= qty;
  return next;
}
