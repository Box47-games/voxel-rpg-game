/**
 * toolDurability.js — Tool wear, breaking and repair (pure functions).
 *
 * A tool is any item with `maxDurability` (stone, iron and steel axes and
 * pickaxes). `durability` counts down as it mines: each block costs
 * ceil(hardness) uses, at least 1. At 0 the tool is broken: it stays in the
 * inventory but mines like bare hands until repaired. Repair restores full
 * durability for TOOL_REPAIR_COST_FRACTION of the recipe, scaled by wear.
 * Items saved before durability existed have no `durability`: they count as new.
 */

import { TOOL_REPAIR_COST_FRACTION, DEATH_TOOL_DURABILITY_LOSS } from '../../data/tuning';
import { canAffordByVolume } from '../../data/pieces';

export function isTool(item) {
  return !!item && item.maxDurability > 0;
}

/** Uses left (full for an item that predates durability). */
export function getDurability(item) {
  if (!isTool(item)) return 0;
  return item.durability ?? item.maxDurability;
}

export function isBroken(item) {
  return isTool(item) && getDurability(item) <= 0;
}

/** The item that actually mines: null (bare hands) when the tool is broken. */
export function usableTool(item) {
  return isBroken(item) ? null : item || null;
}

/** Uses one block costs: harder blocks wear tools faster. */
export function wearForBlock(hardness) {
  if (!Number.isFinite(hardness)) return 1;
  return Math.max(1, Math.ceil(hardness));
}

/** A copy of `item` with `amount` uses taken off (never below 0). */
export function wearTool(item, amount) {
  if (!isTool(item)) return item;
  return { ...item, durability: Math.max(0, getDurability(item) - amount) };
}

/** Dying costs DEATH_TOOL_DURABILITY_LOSS of the tool's full durability. */
export function applyDeathWear(item) {
  if (!isTool(item)) return item;
  return wearTool(item, Math.ceil(item.maxDurability * DEATH_TOOL_DURABILITY_LOSS));
}

/**
 * Materials to repair `item` to full, or null when it needs no repair.
 * @returns {Object<string, number>|null}
 */
export function getRepairCost(item) {
  if (!isTool(item)) return null;
  const missing = item.maxDurability - getDurability(item);
  if (missing <= 0) return null;
  const share = TOOL_REPAIR_COST_FRACTION * (missing / item.maxDurability);
  const cost = {};
  for (const [material, amount] of Object.entries(item.requirements || {})) {
    cost[material] = Math.max(1, Math.ceil(amount * share));
  }
  return cost;
}

export function canAffordRepair(item, materials) {
  const cost = getRepairCost(item);
  if (!cost) return false;
  return canAffordByVolume(materials, cost); // planks and slabs count
}

/** A copy of `item` at full durability. */
export function repairedTool(item) {
  return isTool(item) ? { ...item, durability: item.maxDurability } : item;
}
