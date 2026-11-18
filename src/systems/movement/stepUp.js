/**
 * stepUp.js — Half-block steps for the player: walking into something one
 * unit tall (a floor slab, a layer of cubes) hops onto it instead of stopping.
 */

import { isSolid } from '../chunks/blockTypes';
import { STEP_UP_DETECT_RANGE } from '../../data/tuning';

/** Solid at this exact point? A shaped cell (pieces) only where a piece is. */
export function solidAt(cm, x, y, z) {
  if (cm.isSolidAt) return cm.isSolidAt(x, y, z);
  return isSolid(cm.getBlock(x, y, z));
}

/**
 * A half-block step ahead of a player at `pos` walking along (dirX, dirZ):
 * solid just above the feet, clear from one unit up to above the head, and
 * headroom above the player too.
 * @returns {number | null} height of the step's top, or null for no step
 */
export function stepUpAhead(cm, pos, dirX, dirZ, range = STEP_UP_DETECT_RANGE) {
  if (!cm) return null;
  const x = pos.x + dirX * range;
  const z = pos.z + dirZ * range;
  if (!solidAt(cm, x, pos.y + 0.5, z)) return null;
  for (const dy of [1.5, 2.5, 3.5]) {
    if (solidAt(cm, x, pos.y + dy, z)) return null;
  }
  if (solidAt(cm, pos.x, pos.y + 3.5, pos.z)) return null;
  const top = cm.standingHeight ? cm.standingHeight(x, z, pos.y + 1.05) : null;
  return top != null && top > pos.y ? top : Math.floor(pos.y) + 1;
}
