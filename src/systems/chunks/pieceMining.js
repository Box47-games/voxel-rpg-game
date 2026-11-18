/**
 * pieceMining.js — Find and mine one piece of a shaped cell.
 *
 * A shaped cell holds pieces (slabs, plank halves, cubes; see cellShape.js).
 * Mining hits one piece and removes only that piece. A plank is 4 long, so it
 * spans two cells: mining either half removes both and gives one plank.
 * A mined piece comes back whole (placing then mining is never a gain or a loss).
 */

import { VOXEL_SIZE } from './coordinates.js';
import { BlockTypes } from './blockTypes.js';
import {
  SHAPE_KIND, shapeKind, shapeAxis, pieceAt, removePiece, plankPartnerOffset, subCubeOf, cellPieces,
} from './cellShape.js';
import { MATERIAL_BLOCK } from '../../data/blockDrops.js';
import { PIECES, BLOCK_UNITS } from '../../data/pieces.js';

const MATERIAL_OF_BLOCK = Object.fromEntries(
  Object.entries(MATERIAL_BLOCK).map(([mat, type]) => [type, mat])
);

/** Centre of the cell holding a world point. */
export function cellCenter(x, y, z) {
  const c = (n) => Math.floor(n / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
  return [c(x), c(y), c(z)];
}

/**
 * The piece under a world point, or null when the cell there is a plain
 * block (or the point is in an empty part of a shaped cell).
 * @returns {{ center: number[], shape: number, piece: object, kind: number,
 *   box: number[] } | null}
 */
export function targetPiece(chunkManager, point) {
  if (!chunkManager?.getShape || !point) return null;
  const center = cellCenter(point.x, point.y, point.z);
  const shape = chunkManager.getShape(center[0], center[1], center[2]);
  if (!shape) return null;
  const [sx, sy, sz] = subCubeOf(point.x, point.y, point.z, VOXEL_SIZE);
  const piece = pieceAt(shape, sx, sy, sz);
  if (!piece) return null;
  return { center, shape, piece, kind: shapeKind(shape), box: piece.box };
}

/** Units (of 8 per block) a mined piece is worth: a plank counts both halves. */
export function minedUnits(kind) {
  return kind === SHAPE_KIND.CUBES ? 1 : 4;
}

/**
 * Mining time of a piece as a fraction of its block's (a slab or plank takes
 * half as long as a block; a cube takes a quarter at least).
 */
export function pieceMiningFraction(kind) {
  return Math.max(0.25, minedUnits(kind) / BLOCK_UNITS);
}

/** The other half of a plank, if it is there: { center, shape, piece } or null. */
function plankPartner(chunkManager, target, blockType) {
  const off = plankPartnerOffset(target.shape, target.piece.index);
  const c = target.center.map((v, a) => v + off[a] * VOXEL_SIZE);
  if (chunkManager.getBlock(c[0], c[1], c[2]) !== blockType) return null;
  const shape = chunkManager.getShape(c[0], c[1], c[2]);
  if (shapeKind(shape) !== SHAPE_KIND.PLANK || shapeAxis(shape) !== shapeAxis(target.shape)) return null;
  const piece = cellPieces(shape).find((p) => p.index === target.piece.index);
  return piece ? { center: c, shape, piece } : null;
}

function removeFromCell(chunkManager, center, shape, piece, blockType) {
  const next = removePiece(shape, piece);
  return chunkManager.setCell(center[0], center[1], center[2], next ? blockType : BlockTypes.AIR, next);
}

/**
 * Mine the piece under `point`: remove it from the world (both halves of a
 * plank) and work out the drops.
 * @returns {{ blockType: number, kind: number, units: number,
 *   drops: Array<{ material: string, amount: number }> } | null}
 *   null when there is no piece there (a plain block: mine it as a block)
 */
export function minePiece(chunkManager, point) {
  const target = targetPiece(chunkManager, point);
  if (!target) return null;
  const [cx, cy, cz] = target.center;
  const blockType = chunkManager.getBlock(cx, cy, cz);
  if (blockType === BlockTypes.AIR || blockType === BlockTypes.BEDROCK) return null;

  let units = minedUnits(target.kind);
  if (target.kind === SHAPE_KIND.PLANK) {
    const partner = plankPartner(chunkManager, target, blockType);
    if (partner) removeFromCell(chunkManager, partner.center, partner.shape, partner.piece, blockType);
    else units = 2; // a lone half: not a whole plank
  }
  if (!removeFromCell(chunkManager, target.center, target.shape, target.piece, blockType)) return null;

  // Back as the material's own pieces (a whole plank, slab or cube)
  const material = MATERIAL_OF_BLOCK[blockType];
  const drops = [];
  const natural = material && PIECES[material];
  if (natural) {
    const amount = Math.floor(units / natural.units);
    if (amount > 0) drops.push({ material: natural.key, amount });
  }
  return { blockType, kind: target.kind, units, drops };
}
