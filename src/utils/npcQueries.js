/**
 * Read-only lookups over settlement NPCs (no store access, safe in hot paths).
 */

/**
 * Nearest NPC within `range` world units of `pos` on the ground plane, or null.
 * @param {Array<{position: number[]}>} npcs
 * @param {number[]} pos - [x, y, z]
 * @param {number} range
 */
export function findNearestNPC(npcs, pos, range) {
  let best = null;
  let bestDistSq = range * range;
  for (const npc of npcs) {
    if (!npc?.position) continue;
    const dx = npc.position[0] - pos[0];
    const dz = npc.position[2] - pos[2];
    const distSq = dx * dx + dz * dz;
    if (distSq <= bestDistSq) {
      best = npc;
      bestDistSq = distSq;
    }
  }
  return best;
}
