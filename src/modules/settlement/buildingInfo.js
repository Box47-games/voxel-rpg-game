/**
 * buildingInfo.js — Facts about a placed building for the building panel and
 * demolition: where its blocks are, what demolishing refunds, construction
 * ETA, and which farms a Farm Plot powers. Pure functions of store state.
 */

import { getBuildingById, parseLayers } from '../../data/buildings.js';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates.js';
import { getFarmPlots, hasFarmPlotNear } from './farming.js';
import {
  BUILDING_DEMOLISH_REFUND,
  CONSTRUCTION_BLOCK_INTERVAL,
  NPC_BUILD_DURATION,
} from '../../data/tuning.js';

/** Centre of the building's footprint on the ground. */
export function getSiteCenter(site, building = getBuildingById(site.buildingId)) {
  return [
    site.position[0] + (building.size.width * VOXEL_SIZE) / 2,
    site.position[1],
    site.position[2] + (building.size.depth * VOXEL_SIZE) / 2,
  ];
}

/**
 * World positions of the blocks this site has placed so far (all of them once
 * complete), in the same order construction places them.
 * @returns {Array<{ x, y, z, blockType }>} Voxel-centre world coordinates
 */
export function getPlacedBlocks(site, building = getBuildingById(site.buildingId)) {
  if (!building) return [];
  const blocks = parseLayers(building);
  const placed = site.status === 'COMPLETE' ? blocks.length : Math.min(site.blocksPlaced || 0, blocks.length);
  return blocks.slice(0, placed).map((b) => ({
    x: site.position[0] + b.x * VOXEL_SIZE + VOXEL_SIZE / 2,
    y: site.position[1] + b.y * VOXEL_SIZE + VOXEL_SIZE / 2,
    z: site.position[2] + b.z * VOXEL_SIZE + VOXEL_SIZE / 2,
    blockType: b.blockType,
  }));
}

/** Materials returned when a completed building is demolished. */
export function getDemolishRefund(building) {
  const refund = {};
  for (const [mat, amount] of Object.entries(building?.cost || {})) {
    const back = Math.floor(amount * BUILDING_DEMOLISH_REFUND);
    if (back > 0) refund[mat] = back;
  }
  return refund;
}

/**
 * Rough seconds until a BUILDING site finishes: a settler builder places a
 * block every NPC_BUILD_DURATION (scaled by skill), otherwise the site builds
 * itself every CONSTRUCTION_BLOCK_INTERVAL. Null when not being built.
 */
export function getConstructionEta(site, builderSkill = null) {
  if (site.status !== 'BUILDING' || !site.totalBlocks) return null;
  const remaining = Math.max(0, site.totalBlocks - (site.blocksPlaced || 0));
  const perBlock = builderSkill ? NPC_BUILD_DURATION / builderSkill : CONSTRUCTION_BLOCK_INTERVAL;
  return remaining * perBlock;
}

/** Farm zones a completed Farm Plot is close enough to run. */
export function getFarmsPoweredBy(site, zones) {
  const [plot] = getFarmPlots([site]);
  if (!plot) return [];
  return (zones || []).filter((z) => z.type === 'FARMING' && hasFarmPlotNear(z.bounds, [plot]));
}

/** Settlers whose home is this building. */
export function getResidents(site, npcs) {
  return (npcs || []).filter((n) => n.homeId === site.id);
}
