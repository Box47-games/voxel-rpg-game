/**
 * buildingInfo.js — Facts about a placed building for the building panel and
 * demolition: where its blocks are, what demolishing refunds, construction
 * ETA, and which farms a Farm Plot powers. Pure functions of store state.
 */

import { getBuildingById, parseLayers } from '../../data/buildings.js';
import { isSolid } from '../../systems/chunks/blockTypes.js';
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
    shape: b.shape || 0,
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

/** World position, type and shape (0 = full block) of the next cell construction should place, or null. */
export function getNextBlock(site, building = getBuildingById(site.buildingId)) {
  if (!building) return null;
  const b = parseLayers(building)[site.blocksPlaced || 0];
  if (!b) return null;
  return {
    x: site.position[0] + b.x * VOXEL_SIZE + VOXEL_SIZE / 2,
    y: site.position[1] + b.y * VOXEL_SIZE + VOXEL_SIZE / 2,
    z: site.position[2] + b.z * VOXEL_SIZE + VOXEL_SIZE / 2,
    blockType: b.blockType,
    shape: b.shape || 0,
    box: b.box,
  };
}

/**
 * Place the next block (or piece: a slab, plank floor) of a BUILDING site in
 * the world. For an upgrade, the old building's blocks the new blueprint
 * doesn't use are cleared first. The caller then advances the site's count.
 * @param {{ getBlock, setBlock, setCell? }} world
 */
export function placeNextBlock(site, world) {
  if (site.upgradeFrom && (site.blocksPlaced || 0) === 0) {
    for (const b of getUpgradeLeftovers(site)) {
      if (world.getBlock(b.x, b.y, b.z) === b.blockType) world.setBlock(b.x, b.y, b.z, 0);
    }
  }
  const next = getNextBlock(site);
  if (!next) return;
  if (next.shape && world.setCell) world.setCell(next.x, next.y, next.z, next.blockType, next.shape);
  else world.setBlock(next.x, next.y, next.z, next.blockType);
}

/** Blueprint cell key, relative to the site corner. */
const cellKey = (b) => `${b.x},${b.y},${b.z}`;

/**
 * Old-building blocks an upgrade must clear: cells the old blueprint filled
 * but the new one leaves empty (both share the same corner).
 */
export function getUpgradeLeftovers(site) {
  const from = getBuildingById(site.upgradeFrom);
  const to = getBuildingById(site.buildingId);
  if (!from || !to) return [];
  const kept = new Set(parseLayers(to).map(cellKey));
  return getPlacedBlocks({ ...site, buildingId: from.id, status: 'COMPLETE' }, from)
    .filter((_, i) => !kept.has(cellKey(parseLayers(from)[i])));
}

/**
 * Why a completed building can't be upgraded right now, or null if it can.
 * @param {Object} site
 * @param {Object} env - { constructionSites, settledCount, getBlock } (getBlock may be null)
 * @returns {string|null} A message for the player
 */
export function getUpgradeProblem(site, { constructionSites, settledCount, getBlock }) {
  const from = getBuildingById(site.buildingId);
  const upgrade = from?.upgrade;
  const to = upgrade && getBuildingById(upgrade.to);
  if (!to) return 'This building has no upgrade';
  if (site.status !== 'COMPLETE') return 'Finish building it first';
  if (settledCount < upgrade.settlers) {
    return `Needs ${upgrade.settlers} settler${upgrade.settlers === 1 ? '' : 's'} to build it`;
  }

  // The bigger footprint must not run into another building
  const [px, py, pz] = site.position;
  for (const other of constructionSites) {
    if (other.id === site.id) continue;
    const ob = getBuildingById(other.buildingId);
    if (!ob) continue;
    const [sx, sy, sz] = other.position;
    if (px < sx + ob.size.width * VOXEL_SIZE && px + to.size.width * VOXEL_SIZE > sx &&
        py < sy + ob.size.height * VOXEL_SIZE && py + to.size.height * VOXEL_SIZE > sy &&
        pz < sz + ob.size.depth * VOXEL_SIZE && pz + to.size.depth * VOXEL_SIZE > sz) {
      return `Too close to the ${ob.name}`;
    }
  }

  if (getBlock) {
    const oldCells = new Set(parseLayers(from).map(cellKey));
    for (const b of parseLayers(to)) {
      if (oldCells.has(cellKey(b))) continue; // replaced, not new ground
      const wx = px + b.x * VOXEL_SIZE + VOXEL_SIZE / 2;
      const wy = py + b.y * VOXEL_SIZE + VOXEL_SIZE / 2;
      const wz = pz + b.z * VOXEL_SIZE + VOXEL_SIZE / 2;
      if (isSolid(getBlock(wx, wy, wz))) return 'Something is in the way of the bigger building';
      if (b.y === 0 && !isSolid(getBlock(wx, py - VOXEL_SIZE / 2, wz))) {
        return 'The ground next to it is not level enough';
      }
    }
  }
  return null;
}
