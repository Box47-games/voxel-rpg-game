/**
 * farming.js — Farm zone tiles, crop growth and unattended collection.
 *
 * A FARMING zone stores its tiles on the zone itself (`zone.farmTiles`), so
 * they are saved with the zone. A tile only records when it was planted; its
 * stage is derived from world time, so growth needs no per-tick updates:
 *
 *   EMPTY (plantedAt null) → GROWING → READY (FARM_GROW_TIME after planting)
 *
 * Settlers plant EMPTY tiles and harvest READY ones (TaskAssignmentEngine FARM
 * tasks, NPCWorkBehavior tickFarm). A zone only works while a completed Farm
 * Plot stands within FARM_PLOT_RANGE of it.
 */

import { getBuildingById } from '../../data/buildings.js';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates.js';
import {
  FARM_GROW_TIME,
  FARM_HARVEST_YIELD,
  FARM_UNATTENDED_RATE,
  FARM_PLOT_RANGE,
  FARM_MAX_TILES,
} from '../../data/tuning.js';

export const TileStage = {
  EMPTY: 'EMPTY',
  GROWING: 'GROWING',
  READY: 'READY',
};

/**
 * One tile per ground voxel in the zone, at the centre of the voxel column.
 * @param {{minX, minZ, maxX, maxZ}} bounds
 * @param {(x: number, z: number) => number} getGroundY - Top of the ground at (x, z)
 */
export function createFarmTiles(bounds, getGroundY) {
  const tiles = [];
  for (let x = bounds.minX; x < bounds.maxX; x += VOXEL_SIZE) {
    for (let z = bounds.minZ; z < bounds.maxZ; z += VOXEL_SIZE) {
      const cx = x + VOXEL_SIZE / 2;
      const cz = z + VOXEL_SIZE / 2;
      tiles.push({ x: cx, y: getGroundY(cx, cz), z: cz, plantedAt: null, collectedAt: null });
    }
  }
  return tiles;
}

export function getTileStage(tile, elapsed) {
  if (tile.plantedAt == null) return TileStage.EMPTY;
  return elapsed - tile.plantedAt >= FARM_GROW_TIME ? TileStage.READY : TileStage.GROWING;
}

/** 0 → 1 growth progress (1 = ready), 0 for empty tiles. */
export function getTileGrowth(tile, elapsed) {
  if (tile.plantedAt == null) return 0;
  return Math.min(1, Math.max(0, (elapsed - tile.plantedAt) / FARM_GROW_TIME));
}

/** Completed Farm Plots (any building whose effects enable farming). */
export function getFarmPlots(constructionSites) {
  const plots = [];
  for (const site of constructionSites || []) {
    if (site.status !== 'COMPLETE') continue;
    const building = getBuildingById(site.buildingId);
    if (!building?.effects?.enablesFarming) continue;
    plots.push({
      id: site.id,
      x: site.position[0] + (building.size.width * VOXEL_SIZE) / 2,
      z: site.position[2] + (building.size.depth * VOXEL_SIZE) / 2,
    });
  }
  return plots;
}

/** Whether a completed Farm Plot is close enough to the zone's edge to run it. */
export function hasFarmPlotNear(bounds, plots) {
  for (const plot of plots) {
    // Distance from the plot centre to the nearest point of the zone rectangle
    const dx = Math.max(bounds.minX - plot.x, 0, plot.x - bounds.maxX);
    const dz = Math.max(bounds.minZ - plot.z, 0, plot.z - bounds.maxZ);
    if (Math.hypot(dx, dz) <= FARM_PLOT_RANGE) return true;
  }
  return false;
}

/**
 * Why a farm zone can't be placed here, or null if it can.
 * @returns {string|null} A message for the player
 */
export function getFarmZoneProblem(bounds, constructionSites) {
  const tiles = ((bounds.maxX - bounds.minX) / VOXEL_SIZE) * ((bounds.maxZ - bounds.minZ) / VOXEL_SIZE);
  if (tiles > FARM_MAX_TILES) return `Farm too large (max ${FARM_MAX_TILES} plots)`;
  if (!hasFarmPlotNear(bounds, getFarmPlots(constructionSites))) {
    return 'Build a Farm Plot (B) next to the farm first';
  }
  return null;
}

/** Farm zones that can be worked right now (have tiles and a Farm Plot nearby). */
export function getActiveFarms(zones, constructionSites) {
  const plots = getFarmPlots(constructionSites);
  if (plots.length === 0) return [];
  return (zones || []).filter((z) =>
    z.type === 'FARMING' && Array.isArray(z.farmTiles) && hasFarmPlotNear(z.bounds, plots));
}

/** A copy of `tiles` with tile `index` replaced by `{ ...tile, ...changes }`. */
export function withTile(tiles, index, changes) {
  const next = tiles.slice();
  next[index] = { ...tiles[index], ...changes };
  return next;
}

/**
 * Unattended farms: crops left READY trickle in at FARM_UNATTENDED_RATE of a
 * harvest once per FARM_GROW_TIME (they stay READY for a farmer to harvest).
 * @param {Object} zone - An active farm zone
 * @param {number} elapsed - World time
 * @param {boolean} attended - Whether any settler is working this zone
 * @returns {{ amount: number, farmTiles: Object[] }|null} Food to deposit and the
 *   updated tiles, or null when nothing was collected
 */
export function collectUnattended(zone, elapsed, attended) {
  if (attended) return null;
  const perTile = Math.max(1, Math.round(FARM_HARVEST_YIELD * FARM_UNATTENDED_RATE));
  let amount = 0;
  let tiles = zone.farmTiles;
  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    if (getTileStage(tile, elapsed) !== TileStage.READY) continue;
    const readyAt = tile.plantedAt + FARM_GROW_TIME;
    const since = Math.max(readyAt, tile.collectedAt ?? readyAt);
    if (elapsed - since < FARM_GROW_TIME) continue;
    amount += perTile;
    tiles = withTile(tiles, i, { collectedAt: elapsed });
  }
  return amount > 0 ? { amount, farmTiles: tiles } : null;
}
