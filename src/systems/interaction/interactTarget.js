/**
 * interactTarget.js — What the use key (E, or the touch E button) would open
 * near the player: a construction site or building, a stockpile, or a
 * settler. Shared by the key handler (BlockInteraction) and the on-screen
 * prompt (InteractPrompt), so they always agree.
 *
 * Order: whichever of site/stockpile is in range and no further than the
 * nearest settler wins (so settlers working there don't block E); else the
 * settler.
 */

import { VOXEL_SIZE } from '../chunks/coordinates';
import { getBuildingById } from '../../data/buildings';
import { findNearestNPC } from '../../utils/npcQueries';
import {
  STOCKPILE_INTERACT_RANGE,
  CONSTRUCTION_INTERACT_RANGE,
  BUILDING_INTERACT_RANGE,
  NPC_INTERACT_RANGE,
} from '../../data/tuning';

/** Flat distance from (x, z) to a zone's rectangle; 0 inside it. */
export function distanceToZone(zone, x, z) {
  const { minX, minZ, maxX, maxZ } = zone.bounds;
  const dx = Math.max(Math.min(minX, maxX) - x, 0, x - Math.max(minX, maxX));
  const dz = Math.max(Math.min(minZ, maxZ) - z, 0, z - Math.max(minZ, maxZ));
  return Math.hypot(dx, dz);
}

/**
 * @param {object} store - useGameStore.getState()
 * @param {number[]} playerPos
 * @returns {{ kind: 'site'|'building'|'stockpile'|'settler', id: string, label: string }|null}
 */
export function findInteractTarget(store, playerPos) {
  if (!playerPos) return null;
  const [px, , pz] = playerPos;
  const settled = (store.settlement?.npcs || []);
  const npc = findNearestNPC(settled, playerPos, NPC_INTERACT_RANGE);
  const npcDist = npc ? Math.hypot(npc.position[0] - px, npc.position[2] - pz) : Infinity;

  for (const site of store.constructionSites || []) {
    const building = getBuildingById(site.buildingId);
    if (!building) continue;
    const complete = site.status === 'COMPLETE';
    const range = complete ? BUILDING_INTERACT_RANGE : CONSTRUCTION_INTERACT_RANGE;
    const cx = site.position[0] + (building.size.width * VOXEL_SIZE) / 2;
    const cz = site.position[2] + (building.size.depth * VOXEL_SIZE) / 2;
    const d = Math.hypot(px - cx, pz - cz);
    if (d <= range && d <= npcDist) {
      return complete
        ? { kind: 'building', id: site.id, label: building.name }
        : { kind: 'site', id: site.id, label: `${building.name} (building site)` };
    }
  }

  for (const zone of store.zones || []) {
    if (zone.type !== 'STOCKPILE' || !zone.storage) continue;
    const d = distanceToZone(zone, px, pz);
    if (d <= STOCKPILE_INTERACT_RANGE && d <= npcDist) {
      return { kind: 'stockpile', id: zone.id, label: 'Stockpile' };
    }
  }

  if (npc) return { kind: 'settler', id: npc.id, label: npc.firstName || npc.fullName || 'Settler' };
  return null;
}
