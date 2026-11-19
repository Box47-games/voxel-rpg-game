/**
 * buildingInfo.js — Facts about a placed building for the building panel and
 * demolition: where its blocks are, what demolishing refunds, construction
 * ETA, and which farms a Farm Plot powers. Pure functions of store state.
 */

import { getBuildingById, parseLayers, cellUnits } from '../../data/buildings.js';
import { isSolid, BlockTypes } from '../../systems/chunks/blockTypes.js';
import { MATERIAL_BLOCK } from '../../data/blockDrops.js';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates.js';
import { getFarmPlots, hasFarmPlotNear } from './farming.js';
import {
  BUILDING_DEMOLISH_REFUND,
  CONSTRUCTION_BLOCK_INTERVAL,
  NPC_BUILD_DURATION,
} from '../../data/tuning.js';

// ── Paying as you build ───────────────────────────────────────────────
// A site collects its materials while it is being built: each block or piece
// takes its share of the cost when it is placed. A material's cost is spread
// over the blueprint cells of that material by volume (a slab is half a
// block's share); a cost no cell uses (or an upgrade's) is spread over every
// cell. Building waits only when the next cell's share hasn't arrived.

/** The cost material a blueprint cell's block counts toward ('wood', 'stone', 'iron', 'coal'). */
const MATERIAL_OF_BLOCK = {
  ...Object.fromEntries(Object.entries(MATERIAL_BLOCK).map(([mat, type]) => [type, mat])),
  [BlockTypes.IRON_ORE]: 'iron',
  [BlockTypes.COAL_ORE]: 'coal',
};

const EPS = 1e-6;
const _schedules = new Map();

/**
 * Cumulative materials needed to have placed the first k cells, for k = 1..n.
 * @returns {Array<Object<string, number>>} index k-1 → { material: amount }
 */
export function paymentSchedule(site, building = getBuildingById(site.buildingId)) {
  if (!building) return [];
  const required = site.materialsRequired || {};
  const key = `${building.id}|${JSON.stringify(required)}`;
  const cached = _schedules.get(key);
  if (cached) return cached;

  const cells = parseLayers(building);
  const weights = {}; // material → per-cell weights
  for (const mat of Object.keys(required)) {
    const own = cells.map((c) => (MATERIAL_OF_BLOCK[c.blockType] === mat ? cellUnits(c) : 0));
    weights[mat] = own.some((w) => w > 0) ? own : cells.map(cellUnits);
  }
  const totals = Object.fromEntries(Object.entries(weights).map(([m, w]) => [m, w.reduce((a, b) => a + b, 0)]));
  const run = Object.fromEntries(Object.keys(required).map((m) => [m, 0]));
  const schedule = cells.map((_, i) => {
    const step = {};
    for (const mat of Object.keys(required)) {
      run[mat] += weights[mat][i];
      // The last cell takes exactly the rest (no rounding left over)
      step[mat] = i === cells.length - 1 ? required[mat] : (required[mat] * run[mat]) / (totals[mat] || 1);
    }
    return step;
  });
  if (_schedules.size > 64) _schedules.clear();
  _schedules.set(key, schedule);
  return schedule;
}

const _cellWork = new Map(); // building id → per-cell share of a block's build time

/**
 * Share of a full block's build time the site's next cell takes: a slab or
 * plank cell is half a block, so it goes up in half the time.
 */
export function nextCellWork(site, building = getBuildingById(site.buildingId)) {
  if (!building) return 1;
  let work = _cellWork.get(building.id);
  if (!work) {
    work = parseLayers(building).map((c) => cellUnits(c) / 8);
    _cellWork.set(building.id, work);
  }
  return work[site.blocksPlaced || 0] ?? 1;
}

/** Materials the cells placed so far have used: { material: amount }. */
export function materialsUsed(site, building = getBuildingById(site.buildingId)) {
  const n = site.status === 'COMPLETE' ? (site.totalBlocks || 0) : site.blocksPlaced || 0;
  if (n <= 0) return {};
  return { ...(paymentSchedule(site, building)[n - 1] || site.materialsRequired) };
}

/**
 * What the next cell still needs before it can go in: { material: amount }
 * (empty when it is paid for). Null when the site has nothing left to place.
 */
export function nextCellShortfall(site, building = getBuildingById(site.buildingId)) {
  if (!building || site.status === 'COMPLETE') return null;
  const n = site.blocksPlaced || 0;
  const step = paymentSchedule(site, building)[n];
  if (!step) return null;
  const short = {};
  for (const [mat, need] of Object.entries(step)) {
    const missing = need - (site.materialsDelivered?.[mat] || 0);
    if (missing > EPS) short[mat] = missing;
  }
  return short;
}

/** Can the next block or piece be placed now (its share of the cost is in)? */
export function canPlaceNext(site, building = getBuildingById(site.buildingId)) {
  // No blueprint to pay along: build once everything has arrived
  if (!building) return site.status !== 'COMPLETE' && (site.blocksPlaced || 0) < (site.totalBlocks || 0) && !needsMaterials(site);
  const short = nextCellShortfall(site, building);
  return short != null && Object.keys(short).length === 0;
}

/** Does the site still need deliveries (anything required not yet delivered)? */
export function needsMaterials(site) {
  if (site.status === 'COMPLETE') return false;
  return Object.entries(site.materialsRequired || {})
    .some(([mat, req]) => (site.materialsDelivered?.[mat] || 0) < req - EPS);
}

/**
 * Where a site is, for labels: 'complete', 'building' (the next piece is paid
 * for), or 'waiting' (for materials; nothing placed yet or stalled part way).
 */
export function siteStage(site) {
  if (site.status === 'COMPLETE') return 'complete';
  return canPlaceNext(site) ? 'building' : 'waiting';
}

/** Fraction built (placed cells over all cells). */
export function buildProgress(site) {
  if (site.status === 'COMPLETE') return 1;
  return site.totalBlocks > 0 ? Math.min(1, (site.blocksPlaced || 0) / site.totalBlocks) : 0;
}

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
 * Rough seconds until a site with all its materials finishes: a settler builder places a
 * block every NPC_BUILD_DURATION (scaled by skill), otherwise the site builds
 * itself every CONSTRUCTION_BLOCK_INTERVAL. Null when not being built.
 */
export function getConstructionEta(site, builderSkill = null) {
  // Only while it can keep going: a site waiting on materials has no ETA
  if (site.status === 'COMPLETE' || !site.totalBlocks || needsMaterials(site) || !canPlaceNext(site)) return null;
  if (!builderSkill) return Math.max(0, site.totalBlocks - (site.blocksPlaced || 0)) * CONSTRUCTION_BLOCK_INTERVAL;
  // A settler builds pieces faster than blocks (nextCellWork); add up the cells left
  const building = getBuildingById(site.buildingId);
  let work = 0;
  for (let i = site.blocksPlaced || 0; i < site.totalBlocks; i++) {
    work += building ? nextCellWork({ ...site, blocksPlaced: i }, building) : 1;
  }
  return (work * NPC_BUILD_DURATION) / builderSkill;
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
