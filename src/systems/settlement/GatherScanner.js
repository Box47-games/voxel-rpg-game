/**
 * GatherScanner.js — Finds natural trees and berry bushes near the
 * settlement for settlers to fell and forage (CHOP / FORAGE tasks).
 *
 * A tree is a column of WOOD standing on ground with LEAVES above it (as
 * terrain generation grows them), so wooden walls the player built are left
 * alone. Columns inside a construction site's footprint are skipped too.
 */

import { BlockTypes } from '../chunks/blockTypes';
import { VOXEL_SIZE, CHUNK_SIZE_Y } from '../chunks/coordinates';
import { getBuildingById } from '../../data/buildings';

const TRUNK_MAX = 8; // blocks: taller columns aren't trees
const CROWN_REACH = 2; // leaves this far (blocks) round the trunk top belong to it
const CROWN_HEIGHT = 3; // leaf layers above the trunk

const centreOf = (v) => v * VOXEL_SIZE + VOXEL_SIZE / 2;
const voxel = (w) => Math.floor(w / VOXEL_SIZE);

function insideSite(sites, x, z) {
  for (const site of sites || []) {
    const b = getBuildingById(site.buildingId);
    if (!b) continue;
    const [sx, , sz] = site.position;
    if (x >= sx && x < sx + b.size.width * VOXEL_SIZE && z >= sz && z < sz + b.size.depth * VOXEL_SIZE) return true;
  }
  return false;
}

/**
 * @param {{ getBlock(x, y, z): number }} world
 * @param {number[]} center - settlement centre [x, y, z]
 * @param {number} radius - world units
 * @param {object[]} [constructionSites]
 * @returns {{ trees: {x,y,z,trunk:number}[], bushes: {x,y,z}[] }} nearest first;
 *   tree x/y/z is the centre of its lowest trunk block
 */
export function scanGatherTargets(world, center, radius, constructionSites = []) {
  const trees = [];
  const bushes = [];
  const [cx, , cz] = center;
  const r = Math.ceil(radius / VOXEL_SIZE);
  const vcx = voxel(cx);
  const vcz = voxel(cz);
  for (let dx = -r; dx <= r; dx++) {
    for (let dz = -r; dz <= r; dz++) {
      const x = centreOf(vcx + dx);
      const z = centreOf(vcz + dz);
      const dist = Math.hypot(x - cx, z - cz);
      if (dist > radius) continue;
      // Top down: skip air, note leaves, stop at the first other block
      let sawLeaves = false;
      for (let vy = CHUNK_SIZE_Y - 1; vy >= 0; vy--) {
        const b = world.getBlock(x, centreOf(vy), z);
        if (!b || b === BlockTypes.AIR) continue;
        if (b === BlockTypes.LEAVES) { sawLeaves = true; continue; }
        if (b === BlockTypes.BERRY_BUSH) {
          bushes.push({ x, y: centreOf(vy), z, dist });
        } else if (b === BlockTypes.WOOD && sawLeaves && !insideSite(constructionSites, x, z)) {
          let base = vy;
          while (base > 0 && world.getBlock(x, centreOf(base - 1), z) === BlockTypes.WOOD) base--;
          const trunk = vy - base + 1;
          const below = world.getBlock(x, centreOf(base - 1), z);
          if (trunk <= TRUNK_MAX && below && below !== BlockTypes.AIR && below !== BlockTypes.WATER) {
            trees.push({ x, y: centreOf(base), z, trunk, dist });
          }
        }
        break;
      }
    }
  }
  const byDist = (a, b) => a.dist - b.dist;
  return { trees: trees.sort(byDist), bushes: bushes.sort(byDist) };
}

/**
 * Fell the tree whose lowest trunk block is at (x, y, z): clear the trunk and
 * the leaf crown on top of it.
 * @returns {number} trunk blocks felled (0 if no tree is there any more)
 */
export function fellTree(world, x, y, z) {
  if (world.getBlock(x, y, z) !== BlockTypes.WOOD) return 0;
  let top = y;
  let trunk = 0;
  while (world.getBlock(x, top, z) === BlockTypes.WOOD && trunk < TRUNK_MAX) {
    world.setBlock(x, top, z, BlockTypes.AIR);
    trunk++;
    top += VOXEL_SIZE;
  }
  for (let ly = 0; ly < CROWN_HEIGHT; ly++) {
    for (let dx = -CROWN_REACH; dx <= CROWN_REACH; dx++) {
      for (let dz = -CROWN_REACH; dz <= CROWN_REACH; dz++) {
        const lx = x + dx * VOXEL_SIZE;
        const lyw = top + ly * VOXEL_SIZE;
        const lz = z + dz * VOXEL_SIZE;
        if (world.getBlock(lx, lyw, lz) === BlockTypes.LEAVES) world.setBlock(lx, lyw, lz, BlockTypes.AIR);
      }
    }
  }
  return trunk;
}
