/**
 * ShelterEffects.js — What shelter and hunger do to the player's regeneration.
 *
 * Health regenerates slowly (PLAYER_HEALTH_REGEN), scaled by hunger (full when
 * well fed, half when hungry, none when starving) and doubled in shelter. It
 * waits PLAYER_HEALTH_REGEN_DELAY seconds after the player takes damage, so it
 * never heals mid-fight. Stamina regenerates faster in shelter.
 */

import {
  PLAYER_HEALTH_REGEN,
  SHELTER_HEALTH_REGEN_MULT,
  SHELTER_STAMINA_REGEN_MULT,
  SHELTER_MONSTER_EXCLUSION,
} from '../../data/tuning';
import { getHealthRegenModifier } from './HungerSystem';

/** Full or partial shelter (roof plus walls, or underground). */
export function isSheltered(shelter) {
  return !!(shelter && (shelter.isFullShelter || shelter.isPartialShelter));
}

/**
 * Health regenerated per second.
 * @param {number} hunger - 0–100
 * @param {Object} shelter - The store's shelter state
 * @param {number} regenDelay - Seconds left before regen may start (after damage)
 */
export function getHealthRegenRate(hunger, shelter, regenDelay = 0) {
  if (regenDelay > 0) return 0;
  const mult = isSheltered(shelter) ? SHELTER_HEALTH_REGEN_MULT : 1;
  return PLAYER_HEALTH_REGEN * getHealthRegenModifier(hunger) * mult;
}

/** Multiplier on the player's stamina regeneration. */
export function getStaminaRegenMult(shelter) {
  return isSheltered(shelter) ? SHELTER_STAMINA_REGEN_MULT : 1;
}

/**
 * Whether a rift may spawn a monster at (x, z): never within
 * SHELTER_MONSTER_EXCLUSION of a sheltered player.
 */
export function canSpawnNear(x, z, playerPos, sheltered) {
  if (!sheltered || !playerPos) return true;
  return Math.hypot(x - playerPos[0], z - playerPos[2]) > SHELTER_MONSTER_EXCLUSION;
}
