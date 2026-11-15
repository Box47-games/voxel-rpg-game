/**
 * housing.js — Beds, population cap and home assignment, derived from the store.
 *
 * Homes are completed construction sites whose building has `effects.housing`
 * beds. Nothing here is stored besides each NPC's `homeId`, so a removed or
 * unfinished building simply stops being a home on the next tick.
 */

import { getBuildingById } from '../../data/buildings.js';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates.js';
import {
  HOUSING_FREE_SETTLERS,
  HOUSING_CAMPFIRE_SLEEP_RADIUS,
  IMMIGRATION_MAX_NPCS,
} from '../../data/tuning.js';

/** States in which an NPC has not (or no longer) joined the settlement. */
const NOT_SETTLED = new Set(['APPROACHING', 'EVALUATING', 'LEAVING']);

export function isSettled(npc) {
  return !NOT_SETTLED.has(npc.state);
}

/**
 * Completed buildings with beds.
 * @returns {Array<{ id, name, beds, sleepPosition: number[] }>}
 */
export function getHomes(constructionSites) {
  const homes = [];
  for (const site of constructionSites || []) {
    if (site.status !== 'COMPLETE') continue;
    const building = getBuildingById(site.buildingId);
    const beds = building?.effects?.housing || 0;
    if (beds <= 0) continue;
    // Settlers can't walk inside (walls and roofs block them), so they sleep
    // on the doorstep: centered on the front (min-Z) wall, one block out.
    const sleepPosition = [
      site.position[0] + (building.size.width * VOXEL_SIZE) / 2,
      site.position[1],
      site.position[2] - VOXEL_SIZE,
    ];
    homes.push({ id: site.id, name: building.name, beds, sleepPosition });
  }
  return homes;
}

export function getTotalBeds(homes) {
  let total = 0;
  for (const home of homes) total += home.beds;
  return total;
}

/** Most NPCs (including ones still arriving) the settlement accepts. */
export function getPopulationCap(homes) {
  return Math.min(IMMIGRATION_MAX_NPCS, Math.max(HOUSING_FREE_SETTLERS, getTotalBeds(homes)));
}

/**
 * Decide every settled NPC's home. Existing assignments are kept while their
 * home still exists and has room; then homeless settlers take free beds,
 * longest-settled first (list order). NPCs not yet settled get no home.
 * @returns {Map<string, string|null>} npcId → homeId (null = homeless)
 */
export function assignHomes(npcs, homes) {
  const free = new Map(homes.map((h) => [h.id, h.beds]));
  const result = new Map();
  const waiting = [];

  for (const npc of npcs) {
    if (!isSettled(npc)) {
      result.set(npc.id, null);
      continue;
    }
    const current = npc.homeId;
    if (current && (free.get(current) || 0) > 0) {
      free.set(current, free.get(current) - 1);
      result.set(npc.id, current);
    } else {
      waiting.push(npc);
    }
  }

  for (const npc of waiting) {
    let assigned = null;
    for (const home of homes) {
      const left = free.get(home.id);
      if (left > 0) {
        free.set(home.id, left - 1);
        assigned = home.id;
        break;
      }
    }
    result.set(npc.id, assigned);
  }

  return result;
}

/**
 * The NPC's home for this tick: from the tick's assignments when present,
 * otherwise whatever the NPC already has (pure unit tests pass no housing).
 */
export function resolveHomeId(npc, context) {
  if (context.homeAssignments) return context.homeAssignments.get(npc.id) ?? null;
  return npc.homeId ?? null;
}

/** Which of its home's beds an NPC has (order of assignment), 0 if unknown. */
function getBedIndex(npcId, homeId, homeAssignments) {
  if (!homeAssignments) return 0;
  let index = 0;
  for (const [id, home] of homeAssignments) {
    if (id === npcId) return index;
    if (home === homeId) index++;
  }
  return 0;
}

/** Where a tired NPC goes to sleep: its home's doorstep, else near the campfire. */
export function getSleepTarget(npc, context) {
  const homeId = resolveHomeId(npc, context);
  const home = homeId ? context.homes?.get(homeId) : null;
  if (home) {
    // Housemates lie side by side along the front wall, one block apart
    const bed = getBedIndex(npc.id, homeId, context.homeAssignments);
    const [x, y, z] = home.sleepPosition;
    return [x + (bed - (home.beds - 1) / 2) * VOXEL_SIZE, y, z];
  }
  const center = context.center;
  if (!center) return null;
  const angle = Math.random() * Math.PI * 2;
  const dist = HOUSING_CAMPFIRE_SLEEP_RADIUS * (0.5 + Math.random() * 0.5);
  return [center[0] + Math.cos(angle) * dist, center[1], center[2] + Math.sin(angle) * dist];
}
