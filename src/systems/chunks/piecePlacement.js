/**
 * piecePlacement.js — Placing one piece (slab, plank, cube) in the world.
 *
 * Aiming works on the 1-unit sub-grid (a block is 2×2×2 units): a ray finds
 * the unit it hits and the face it entered by, and the piece goes into the
 * unit in front of that face.
 *
 * - Cube: that unit.
 * - Slab: the half of that unit's cell along the slab's axis. By default the
 *   slab lies against the face aimed at (a floor on a top face, a wall slab on
 *   a side); rotating turns it through the three axes.
 * - Plank: a bar 4 long through that unit. By default it runs the way you look
 *   (level); rotating turns it across, then upright. It covers this cell and
 *   the next one along its axis, on the side of the unit aimed at.
 *
 * A piece goes into empty cells, or into a cell holding the same material,
 * kind and axis where its space is free. Pieces never fuse: two slabs in a
 * cell stay two slabs.
 */

import { VOXEL_SIZE, CHUNK_SIZE_Y } from './coordinates.js';
import { BlockTypes } from './blockTypes.js';
import {
  SHAPE_KIND, AXIS, encodeShape, shapeMask, shapeKind, shapeAxis, shapePartners, pieceSlots,
} from './cellShape.js';
import { MATERIAL_BLOCK } from '../../data/blockDrops.js';
import { PIECES, baseMaterial, pieceInfo } from '../../data/pieces.js';

const UNIT = VOXEL_SIZE / 2;
const KIND_OF_SHAPE = { slab: SHAPE_KIND.SLAB, plank: SHAPE_KIND.PLANK, cube: SHAPE_KIND.CUBES };

/** How many orientations a piece kind has (R / the rotate button cycles them). */
export function rotationCount(pieceKey) {
  const info = pieceInfo(pieceKey);
  return info && info.shape !== 'cube' ? 3 : 1;
}

/**
 * Step along a ray through the 1-unit grid (Amanatides & Woo) and return the
 * first solid unit and the face it was entered by.
 * `isSolidAt(x, y, z)` answers for a world point (pieces count only where filled).
 * @returns {{ unit: number[], normal: number[] } | null}
 */
export function raycastUnits(isSolidAt, origin, dir, maxDistance) {
  const pos = [origin.x / UNIT, origin.y / UNIT, origin.z / UNIT];
  const d = [dir.x, dir.y, dir.z];
  const len = Math.hypot(d[0], d[1], d[2]);
  if (!len) return null;
  for (let a = 0; a < 3; a++) d[a] /= len;
  const cell = pos.map(Math.floor);
  const step = d.map((v) => (v > 0 ? 1 : v < 0 ? -1 : 0));
  const tDelta = d.map((v) => (v !== 0 ? Math.abs(1 / v) : Infinity));
  const tMax = d.map((v, a) => {
    if (v > 0) return (cell[a] + 1 - pos[a]) / v;
    if (v < 0) return (pos[a] - cell[a]) / -v;
    return Infinity;
  });
  const maxT = maxDistance / UNIT;
  const normal = [0, 0, 0];
  let t = 0;
  for (let i = 0; i < 4096 && t <= maxT; i++) {
    const c = [(cell[0] + 0.5) * UNIT, (cell[1] + 0.5) * UNIT, (cell[2] + 0.5) * UNIT];
    if (isSolidAt(c[0], c[1], c[2])) {
      return i === 0 ? null : { unit: cell.slice(), normal: normal.slice() };
    }
    const a = tMax[0] < tMax[1] ? (tMax[0] < tMax[2] ? 0 : 2) : (tMax[1] < tMax[2] ? 1 : 2);
    t = tMax[a];
    cell[a] += step[a];
    tMax[a] += tDelta[a];
    normal[0] = normal[1] = normal[2] = 0;
    normal[a] = -step[a];
  }
  return null;
}

const axisOfNormal = (n) => (n[0] ? AXIS.X : n[1] ? AXIS.Y : AXIS.Z);

/**
 * Where a piece would go: the cells it changes and its boxes, with whether it fits.
 * @param {object} cm - chunk manager (getBlock, getShape)
 * @param {string} pieceKey - e.g. 'stone_slab'
 * @param {{ unit: number[], normal: number[] }} hit - from raycastUnits
 * @param {{ rotation?: number, lookAxis?: number }} opts - lookAxis: AXIS.X or AXIS.Z
 * @returns {{ blockType: number, kind: number, axis: number,
 *   cells: Array<{ center: number[], shape: number }>,
 *   boxes: Array<{ min: number[], max: number[] }>, ok: boolean, reason?: string } | null}
 */
export function planPiece(cm, pieceKey, hit, { rotation = 0, lookAxis = AXIS.X } = {}) {
  const info = pieceInfo(pieceKey);
  if (!info || !hit) return null;
  const blockType = MATERIAL_BLOCK[baseMaterial(pieceKey)];
  const kind = KIND_OF_SHAPE[info.shape];
  if (blockType == null || !kind) return null;

  const target = [0, 1, 2].map((a) => hit.unit[a] + hit.normal[a]);
  const cell = target.map((u) => Math.floor(u / 2));
  const sub = target.map((u, a) => u - cell[a] * 2);

  let axis = 0;
  // Per cell: [cellCoords, pieceMask, partnerBits]
  const parts = [];
  if (kind === SHAPE_KIND.CUBES) {
    parts.push([cell, 1 << (sub[0] + sub[1] * 2 + sub[2] * 4), 0]);
  } else if (kind === SHAPE_KIND.SLAB) {
    axis = (axisOfNormal(hit.normal) + rotation) % 3;
    parts.push([cell, pieceSlots(SHAPE_KIND.SLAB, axis)[sub[axis]].mask, 0]);
  } else {
    const order = [lookAxis, lookAxis === AXIS.X ? AXIS.Z : AXIS.X, AXIS.Y];
    axis = order[rotation % 3];
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    const bar = sub[u] + sub[v] * 2;
    const mask = pieceSlots(SHAPE_KIND.PLANK, axis)[bar].mask;
    const plus = sub[axis] === 1;
    const other = cell.slice();
    other[axis] += plus ? 1 : -1;
    parts.push([cell, mask, plus ? 1 << bar : 0]);
    parts.push([other, mask, plus ? 0 : 1 << bar]);
  }

  const cells = [];
  const boxes = [];
  let ok = true;
  let reason;
  for (const [c, mask, partner] of parts) {
    const center = c.map((v) => v * VOXEL_SIZE + VOXEL_SIZE / 2);
    boxes.push(boxOfMask(c, mask));
    if (center[1] < 0 || center[1] >= CHUNK_SIZE_Y * VOXEL_SIZE) { ok = false; reason = 'Out of the world'; continue; }
    const type = cm.getBlock(center[0], center[1], center[2]);
    const shape = type === BlockTypes.AIR ? 0 : cm.getShape(center[0], center[1], center[2]);
    if (type === BlockTypes.AIR) {
      cells.push({ center, shape: encodeShape(mask, kind, axis, partner) });
      continue;
    }
    const fits = type === blockType && shape && shapeKind(shape) === kind &&
      (kind === SHAPE_KIND.CUBES || shapeAxis(shape) === axis) && (shapeMask(shape) & mask) === 0;
    if (!fits) {
      ok = false;
      reason = shape && type !== blockType ? 'One material per block space' : "Doesn't fit there";
      continue;
    }
    cells.push({ center, shape: encodeShape(shapeMask(shape) | mask, kind, axis, shapePartners(shape) | partner) });
  }
  return { blockType, kind, axis, cells, boxes, ok, reason };
}

/** World-space box of a mask's filled sub-cubes in cell `c` (a box shape). */
function boxOfMask(c, mask) {
  const min = [2, 2, 2], max = [0, 0, 0];
  for (let i = 0; i < 8; i++) {
    if (!(mask & (1 << i))) continue;
    const s = [i & 1, (i >> 1) & 1, (i >> 2) & 1];
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], s[a]);
      max[a] = Math.max(max[a], s[a] + 1);
    }
  }
  return {
    min: min.map((v, a) => c[a] * VOXEL_SIZE + v * UNIT),
    max: max.map((v, a) => c[a] * VOXEL_SIZE + v * UNIT),
  };
}

/** Does any box overlap an axis-aligned box [min, max]? */
export function boxesOverlap(boxes, min, max) {
  return boxes.some((b) => [0, 1, 2].every((a) => b.min[a] < max[a] && b.max[a] > min[a]));
}

/** Write a planned piece into the world. @returns {boolean} */
export function applyPiece(cm, plan) {
  if (!plan?.ok) return false;
  let changed = false;
  for (const { center, shape } of plan.cells) {
    if (cm.setCell(center[0], center[1], center[2], plan.blockType, shape)) changed = true;
  }
  return changed;
}

/** The natural piece key of a material ('stone' → 'stone_slab'), or null. */
export const pieceKeyOf = (material) => PIECES[material]?.key ?? null;
