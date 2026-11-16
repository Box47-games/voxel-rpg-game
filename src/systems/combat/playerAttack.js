/**
 * playerAttack.js — The player's "attack toward a point" action, shared by
 * tap-to-attack (TouchControls) and the touch context button.
 * Casts the chosen spell if it can (mana, cooldown); otherwise swings melee.
 */

import { getSpellById, executeSpell } from '../../data/spells';
import { performMeleeAttack, MELEE_COOLDOWN } from '../../data/meleeAttack';
import { getEnemyPosition, isEnemyHittable } from './enemyHits';

/**
 * Cast the active spell toward a world point.
 * @param {object} store - useGameStore.getState()
 * @param {{x:number,y:number,z:number}} point
 * @returns {boolean} whether a spell was cast
 */
export function tryCastSpellAt(store, point) {
  const spell = getSpellById(store.activeSpellId);
  if (!spell) return false;
  if (store.player.mana < spell.manaCost) return false;
  if (store.getSpellCooldown(spell.id) > 0) return false;
  const playerWithAim = { ...store.player, aimTarget: [point.x, point.y, point.z] };
  const result = executeSpell(spell, playerWithAim, store);
  if (result.success) store.setSpellCooldown(spell.id, spell.cooldown);
  return result.success;
}

/**
 * Attack toward a world point: spell first, melee as the fallback.
 * @returns {'spell'|'melee'|null}
 */
export function attackToward(store, point) {
  if (tryCastSpellAt(store, point)) return 'spell';
  const meleeCooldown = store.getSpellCooldown('__melee__');
  if (meleeCooldown && meleeCooldown > 0) return null;
  const pp = store.player.position;
  const facingAngle = Math.atan2(point.x - pp[0], point.z - pp[2]);
  performMeleeAttack(store, pp, facingAngle, store.enemies);
  store.setSpellCooldown('__melee__', MELEE_COOLDOWN);
  return 'melee';
}

/**
 * Nearest live enemy within range of the player (flat distance).
 * @returns {{ enemy: object, position: number[], distance: number }|null}
 */
export function findNearestEnemy(store, range) {
  const pp = store.player?.position;
  if (!pp) return null;
  let best = null;
  for (const enemy of store.enemies || []) {
    if (!isEnemyHittable(store, enemy)) continue;
    const pos = getEnemyPosition(store, enemy);
    if (!pos) continue;
    const d = Math.hypot(pos[0] - pp[0], pos[2] - pp[2]);
    if (d <= range && (!best || d < best.distance)) best = { enemy, position: pos, distance: d };
  }
  return best;
}
