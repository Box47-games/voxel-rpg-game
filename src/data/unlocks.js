/**
 * unlocks.js — What the player has unlocked so far.
 *
 *  - Tools, weapons, armour (and the stronger potions) unlock by player
 *    level: RECIPE_LEVELS. Anything not listed is open from the start
 *    (stone tools, basic food, health potions).
 *  - Buildings unlock by settlement milestones: BUILDING_MILESTONES. An
 *    upgrade into a building needs that building unlocked too.
 *  - Blocks are always open.
 *
 * Pure functions over the store state, shared by Craft, the Build catalog,
 * the Plan bar, the store's own guards and the unlock announcements.
 */

import { isSettled } from '../modules/settlement/housing.js';
import { UNLOCK_STONE_HOUSE_SETTLERS, UNLOCK_MANOR_SETTLERS } from './tuning.js';

const HOUSE = UNLOCK_STONE_HOUSE_SETTLERS ?? 3;
const MANOR = UNLOCK_MANOR_SETTLERS ?? 6;

/** Recipe id → player level that unlocks it. */
export const RECIPE_LEVELS = {
  // Iron age
  ironPickaxe: 3,
  ironAxe: 3,
  ironSword: 3,
  ironHelmet: 3,
  manaPotion: 3,
  ironArmor: 5,
  ironRing: 5,
  // Steel
  steelPickaxe: 7,
  steelAxe: 7,
  steelSword: 7,
  ragePotion: 7,
  // Crystal
  crystalSword: 10,
  crystalArmor: 10,
  crystalRing: 10,
  crystalElixir: 10,
};

/** Settlers who have joined (not on their way in, deciding, or leaving). */
export function settledCount(state) {
  return (state.settlement?.npcs || []).filter(isSettled).length;
}

/** Rifts sealed for good. */
export function riftsClosed(state) {
  return (state._riftManager?.rifts || []).filter((r) => r.state === 'CLOSED').length;
}

/**
 * Building id → { goal: what to do, met(state) }. Not listed: open from the start.
 */
export const BUILDING_MILESTONES = {
  storage_shed: {
    goal: 'Found a settlement (place a campfire)',
    met: (s) => !!s.settlement?.settlementCenter,
  },
  stone_house: {
    goal: `Have ${HOUSE} settlers`,
    met: (s) => settledCount(s) >= HOUSE,
    progress: (s) => `${Math.min(HOUSE, settledCount(s))}/${HOUSE} settlers`,
  },
  watchtower: {
    goal: 'Close a rift',
    met: (s) => riftsClosed(s) >= 1,
  },
  manor: {
    goal: `Have ${MANOR} settlers`,
    met: (s) => settledCount(s) >= MANOR,
    progress: (s) => `${Math.min(MANOR, settledCount(s))}/${MANOR} settlers`,
  },
};

/** @returns {null | { reason: string, level: number }} why a recipe is locked, or null */
export function recipeLock(recipe, state) {
  const need = RECIPE_LEVELS[recipe?.id];
  const level = state.player?.level || 1;
  if (!need || level >= need) return null;
  return { level: need, reason: `Reach level ${need}` };
}

/** @returns {null | { reason: string, progress?: string }} why a building is locked, or null */
export function buildingLock(buildingId, state) {
  const m = BUILDING_MILESTONES[buildingId];
  if (!m || m.met(state)) return null;
  return { reason: m.goal, progress: m.progress?.(state) };
}

/** Ids of everything unlocked right now (for "new unlock" announcements). */
export function unlockedIds(state, recipes, buildingIds) {
  const ids = new Set();
  for (const r of recipes) if (!recipeLock(r, state)) ids.add(`recipe:${r.id}`);
  for (const b of buildingIds) if (!buildingLock(b, state)) ids.add(`building:${b}`);
  return ids;
}
