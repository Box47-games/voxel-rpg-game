/**
 * pieces.js — Blocks break into pieces (.claude/plans/block-pieces.md, phase 1).
 *
 * A block of a building material is 8 units. Mining gives the material's
 * natural piece (wood planks and stone slabs are 4 units, dirt/sand/snow/clay
 * cubes are 1). Pieces live in inventory.materials under their own keys
 * (`stone_slab`, `wood_plank`, `dirt_cube`, ...) next to the block keys
 * (`stone`, `wood`, `dirt`, ...).
 *
 * - Placing a block in the world takes a real block (exact shape).
 * - Pieces combine into blocks, and blocks split into pieces, only by crafting
 *   (PIECE_RECIPES).
 * - Costs in blocks (gear recipes, blueprints, repairs, upgrades) are paid by
 *   volume: pieces first, smallest first, then blocks; a block broken to pay a
 *   smaller amount gives the change back as pieces.
 */

import {
  TOOL_TIER,
  PIECE_YIELD_HAND,
  PIECE_YIELD_STONE_TOOL,
  PIECE_YIELD_IRON_TOOL,
  PIECE_YIELD_LOOSE,
} from './tuning';

export const BLOCK_UNITS = 8;

/** Building materials and their natural piece. `tool`: which tool gets the full yield. */
export const PIECES = {
  wood: { key: 'wood_plank', shape: 'plank', units: 4, name: 'Wood plank', tool: 'axe' },
  stone: { key: 'stone_slab', shape: 'slab', units: 4, name: 'Stone slab', tool: 'pickaxe' },
  dirt: { key: 'dirt_cube', shape: 'cube', units: 1, name: 'Dirt cube' },
  sand: { key: 'sand_cube', shape: 'cube', units: 1, name: 'Sand cube' },
  snow: { key: 'snow_cube', shape: 'cube', units: 1, name: 'Snow cube' },
  clay: { key: 'clay_cube', shape: 'cube', units: 1, name: 'Clay cube' },
};

/** Piece key → { base, ...piece } */
const BY_PIECE_KEY = Object.fromEntries(
  Object.entries(PIECES).map(([base, p]) => [p.key, { base, ...p }])
);

/** Is this material key a piece (not a block)? */
export const isPieceKey = (key) => key in BY_PIECE_KEY;

/** Is this a building material that comes in blocks and pieces? */
export const isBuildingMaterial = (key) => key in PIECES;

/** Block material for a key: 'stone_slab' → 'stone'; anything else unchanged. */
export const baseMaterial = (key) => BY_PIECE_KEY[key]?.base ?? key;

/** Info for a piece key, or null. */
export const pieceInfo = (key) => BY_PIECE_KEY[key] || null;

/** Units in `qty` of `key` (a block is 8). Non-building materials count 1 each. */
export function unitsOf(key, qty = 1) {
  if (isBuildingMaterial(key)) return qty * BLOCK_UNITS;
  const piece = BY_PIECE_KEY[key];
  if (piece) return qty * piece.units;
  return qty;
}

/**
 * How much of a material is on hand, in blocks (fractional for pieces):
 * 1 stone block + 3 slabs = 2.5. Non-building materials: their plain count.
 */
export function blocksAvailable(materials, key) {
  const m = materials || {};
  if (!isBuildingMaterial(key)) return m[key] || 0;
  const piece = PIECES[key];
  return ((m[key] || 0) * BLOCK_UNITS + (m[piece.key] || 0) * piece.units) / BLOCK_UNITS;
}

/** Volume of a stack in block-equivalents (stockpile capacity counts this). */
export function volumeOf(key, qty) {
  const piece = BY_PIECE_KEY[key];
  return piece ? (qty * piece.units) / BLOCK_UNITS : qty;
}

/** Can `materials` cover `cost` (in blocks; building materials by volume)? */
export function canAffordByVolume(materials, cost) {
  return Object.entries(cost || {}).every(([key, qty]) => blocksAvailable(materials, key) >= qty - 1e-9);
}

/** What's still missing for `cost`, by material, in blocks. */
export function missingByVolume(materials, cost) {
  const missing = {};
  for (const [key, qty] of Object.entries(cost || {})) {
    const short = qty - blocksAvailable(materials, key);
    if (short > 1e-9) missing[key] = short;
  }
  return missing;
}

/**
 * Pay up to `blocks` of one material from `materials` (mutated in place).
 * Building materials: pieces first, then whole blocks; breaking a block to pay
 * less than a block puts the change back as pieces.
 * @returns {number} blocks actually paid (≤ blocks; fractional for pieces)
 */
export function payVolume(materials, key, blocks) {
  if (blocks <= 0) return 0;
  if (!isBuildingMaterial(key)) {
    const paid = Math.min(blocks, materials[key] || 0);
    if (paid > 0) materials[key] -= paid;
    return paid;
  }
  const piece = PIECES[key];
  let want = Math.round(blocks * BLOCK_UNITS); // units still to pay
  let paidUnits = 0;

  // Pieces first (keeps whole blocks for placing)
  const usePieces = Math.min(materials[piece.key] || 0, Math.floor(want / piece.units));
  if (usePieces > 0) {
    materials[piece.key] -= usePieces;
    want -= usePieces * piece.units;
    paidUnits += usePieces * piece.units;
  }
  // Whole blocks
  const useBlocks = Math.min(materials[key] || 0, Math.floor(want / BLOCK_UNITS));
  if (useBlocks > 0) {
    materials[key] -= useBlocks;
    want -= useBlocks * BLOCK_UNITS;
    paidUnits += useBlocks * BLOCK_UNITS;
  }
  // A remainder smaller than a block: one more piece, else break a block for change
  if (want > 0 && (materials[piece.key] || 0) > 0) {
    materials[piece.key] -= 1;
    paidUnits += Math.min(want, piece.units);
    want = Math.max(0, want - piece.units);
  }
  if (want > 0 && (materials[key] || 0) > 0) {
    materials[key] -= 1;
    const change = BLOCK_UNITS - want;
    materials[piece.key] = (materials[piece.key] || 0) + Math.floor(change / piece.units);
    paidUnits += want;
    want = 0;
  }
  return paidUnits / BLOCK_UNITS;
}

/** Pay a whole cost (in blocks) by volume. Returns a new materials object, or null if short. */
export function spendByVolume(materials, cost) {
  if (!canAffordByVolume(materials, cost)) return null;
  const next = { ...materials };
  for (const [key, qty] of Object.entries(cost || {})) payVolume(next, key, qty);
  for (const k of Object.keys(next)) if (next[k] <= 0 && isPieceKey(k)) delete next[k];
  return next;
}

/**
 * Give back `blocks` of a material (fractional allowed) as blocks plus pieces
 * (refunds of part-built sites). Mutates `materials`.
 */
export function addVolume(materials, key, blocks) {
  if (blocks <= 0) return;
  if (!isBuildingMaterial(key)) {
    materials[key] = (materials[key] || 0) + blocks;
    return;
  }
  const piece = PIECES[key];
  const units = Math.round(blocks * BLOCK_UNITS);
  const whole = Math.floor(units / BLOCK_UNITS);
  const pieces = Math.floor((units - whole * BLOCK_UNITS) / piece.units);
  if (whole > 0) materials[key] = (materials[key] || 0) + whole;
  if (pieces > 0) materials[piece.key] = (materials[piece.key] || 0) + pieces;
}

/** Tool kind from an item: 'pickaxe', 'axe' or null. */
export function toolKind(tool) {
  const id = String(tool?.id || tool?.recipeId || '');
  if (/pickaxe/i.test(id)) return 'pickaxe';
  if (/axe/i.test(id)) return 'axe';
  return null;
}

/** Tier of a tool: stats.toolTier, else from its name (stone / iron / steel / crystal). */
export function toolTierOf(tool) {
  if (!tool) return TOOL_TIER.NONE;
  if (tool.stats?.toolTier) return tool.stats.toolTier;
  const id = String(tool.id || tool.recipeId || '').toLowerCase();
  if (id.startsWith('steel') || id.startsWith('crystal')) return TOOL_TIER.STEEL;
  if (id.startsWith('iron')) return TOOL_TIER.IRON;
  if (id.startsWith('stone')) return TOOL_TIER.STONE;
  return TOOL_TIER.NONE;
}

/** Units kept from mining one block of `base` with a tool of `tier` that suits it. */
export function yieldUnits(base, tier) {
  const piece = PIECES[base];
  if (!piece) return 0;
  if (!piece.tool) return PIECE_YIELD_LOOSE;
  if (tier >= TOOL_TIER.IRON) return PIECE_YIELD_IRON_TOOL;
  if (tier >= TOOL_TIER.STONE) return PIECE_YIELD_STONE_TOOL;
  return PIECE_YIELD_HAND;
}

/**
 * Pieces from mining one block of `base` with `tier`: whole pieces of the
 * yield, plus a chance of one more for a remainder (6 units of stone = one
 * slab and a 50% chance of a second).
 */
export function piecesFromMining(base, tier, random = Math.random) {
  const piece = PIECES[base];
  const units = yieldUnits(base, tier);
  const whole = Math.floor(units / piece.units);
  const extra = (units % piece.units) / piece.units;
  return whole + (extra > 0 && random() < extra ? 1 : 0);
}

/**
 * Tool tiers that matter for pieces, from the equipped tool:
 * the pickaxe tier for stone, the axe tier for wood.
 */
export function pieceTiers(tool) {
  const kind = toolKind(tool);
  const tier = toolTierOf(tool);
  return { pickaxe: kind === 'pickaxe' ? tier : TOOL_TIER.NONE, axe: kind === 'axe' ? tier : TOOL_TIER.NONE };
}

/** Combine and split recipes for the Craft tab's Pieces category. Exact shapes, not by volume. */
export const PIECE_RECIPES = Object.entries(PIECES).flatMap(([base, p]) => {
  const n = BLOCK_UNITS / p.units;
  const blockName = `${base.charAt(0).toUpperCase()}${base.slice(1)} block`;
  return [
    { id: `combine_${base}`, kind: 'combine', base, name: blockName, from: { [p.key]: n }, to: { [base]: 1 } },
    { id: `split_${base}`, kind: 'split', base, name: `${n} ${p.name.toLowerCase()}s`, from: { [base]: 1 }, to: { [p.key]: n } },
  ];
});

/** How many times a piece recipe can run with `materials` (exact shapes). */
export function pieceRecipeTimes(recipe, materials) {
  return Math.min(...Object.entries(recipe.from).map(([k, n]) => Math.floor((materials?.[k] || 0) / n)));
}

/** Run a piece recipe `times` times. Returns new materials, or null if short. */
export function applyPieceRecipe(recipe, materials, times = 1) {
  if (times < 1 || pieceRecipeTimes(recipe, materials) < times) return null;
  const next = { ...materials };
  for (const [k, n] of Object.entries(recipe.from)) next[k] -= n * times;
  for (const [k, n] of Object.entries(recipe.to)) next[k] = (next[k] || 0) + n * times;
  for (const k of Object.keys(next)) if (next[k] <= 0 && isPieceKey(k)) delete next[k];
  return next;
}

/** Display names for inventory materials (blocks, pieces and the rest). */
const MATERIAL_NAMES = {
  wood: 'Wood block', stone: 'Stone block', dirt: 'Dirt block', sand: 'Sand block', snow: 'Snow block', clay: 'Clay block',
  wood_plank: 'Wood plank', stone_slab: 'Stone slab', dirt_cube: 'Dirt cube', sand_cube: 'Sand cube',
  snow_cube: 'Snow cube', clay_cube: 'Clay cube',
  iron: 'Iron', coal: 'Coal', gold_ore: 'Gold ore', crystal: 'Crystal', ice: 'Ice', leather: 'Leather', bone: 'Bone',
  fiber: 'Fiber', herb: 'Herbs', meat: 'Meat', berry: 'Berries', vegetable: 'Vegetables', seed: 'Seeds', mushroom: 'Mushrooms',
};

/** "Stone slab" / "Stone slabs" (qty ≠ 1 pluralises blocks and pieces). */
export function materialName(key, qty = 1) {
  const name = MATERIAL_NAMES[key] || key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
  const countable = isBuildingMaterial(key) || isPieceKey(key);
  return countable && qty !== 1 ? `${name}s` : name;
}

/** "2½ blocks" style amount for a block-denominated cost (pieces count by volume). */
export function formatBlocks(blocks) {
  const eighths = Math.round(blocks * BLOCK_UNITS);
  const whole = Math.floor(eighths / BLOCK_UNITS);
  const fracText = ['', '⅛', '¼', '⅜', '½', '⅝', '¾', '⅞'][eighths % BLOCK_UNITS];
  return `${whole || (fracText ? '' : '0')}${fracText}`;
}
