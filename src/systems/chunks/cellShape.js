/**
 * cellShape.js — Shaped cells: a cell (one 2×2×2 block) holding pieces.
 *
 * A cell's shape is a 16-bit number; 0 means a plain full block (or air).
 *   bits 0-7   fill mask: bit i = sub-cube (sx, sy, sz), i = sx + sy*2 + sz*4
 *   bits 8-9   piece kind: 1 slab, 2 plank, 3 cubes
 *   bits 10-11 axis: 0 x, 1 y, 2 z
 *                slab: the axis the slab is thin along (y = a floor slab)
 *                plank: the axis the plank runs along
 *   bits 12-15 plank only: for each bar, which neighbour cell holds the other
 *              half of the plank (1 = the + side along the axis, 0 = the − side)
 *
 * A cell holds one material and one kind of piece. Pieces never fuse: two
 * slabs filling a cell stay two slabs (mask 0xFF, kind slab).
 *
 * The chunk worker can't import modules, so it carries a copy of the
 * piece-cutting code; a test checks the two copies agree.
 */

export const SHAPE_KIND = { SLAB: 1, PLANK: 2, CUBES: 3 };
export const AXIS = { X: 0, Y: 1, Z: 2 };
export const FULL_MASK = 0xff;

/** Sub-cube index of (sx, sy, sz), each 0 or 1. */
export const subIndex = (sx, sy, sz) => sx + sy * 2 + sz * 4;

/** Pack a shape. */
export function encodeShape(mask, kind, axis = 0, partners = 0) {
  if (!mask || !kind) return 0;
  return (mask & 0xff) | ((kind & 3) << 8) | ((axis & 3) << 10) | ((partners & 0xf) << 12);
}

export const shapeMask = (shape) => shape & 0xff;
export const shapeKind = (shape) => (shape >> 8) & 3;
export const shapeAxis = (shape) => (shape >> 10) & 3;
export const shapePartners = (shape) => (shape >> 12) & 0xf;

/** Is sub-cube (sx, sy, sz) of this cell filled? A full block (shape 0) is. */
export function subFilled(shape, sx, sy, sz) {
  if (!shape) return true;
  return ((shape >> subIndex(sx, sy, sz)) & 1) === 1;
}

/** The two axes other than `axis`, in x, y, z order. */
function otherAxes(axis) {
  return axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1];
}

/** Sub-cube bits of a piece (each piece is a box of sub-cubes). */
function boxMask(box) {
  let m = 0;
  for (let sz = box[2]; sz < box[5]; sz++) {
    for (let sy = box[1]; sy < box[4]; sy++) {
      for (let sx = box[0]; sx < box[3]; sx++) m |= 1 << subIndex(sx, sy, sz);
    }
  }
  return m;
}

/**
 * Every possible piece slot of a shape's kind and axis, filled or not.
 * Each is { index, box: [x0, y0, z0, x1, y1, z1] } in sub-cube units (0..2).
 */
export function pieceSlots(kind, axis) {
  const slots = [];
  if (kind === SHAPE_KIND.CUBES) {
    for (let i = 0; i < 8; i++) {
      const sx = i & 1, sy = (i >> 1) & 1, sz = (i >> 2) & 1;
      slots.push({ index: i, box: [sx, sy, sz, sx + 1, sy + 1, sz + 1] });
    }
  } else if (kind === SHAPE_KIND.SLAB) {
    for (let h = 0; h < 2; h++) {
      const box = [0, 0, 0, 2, 2, 2];
      box[axis] = h;
      box[axis + 3] = h + 1;
      slots.push({ index: h, box });
    }
  } else if (kind === SHAPE_KIND.PLANK) {
    const [u, v] = otherAxes(axis);
    for (let b = 0; b < 4; b++) {
      const box = [0, 0, 0, 2, 2, 2];
      box[u] = b & 1;
      box[u + 3] = (b & 1) + 1;
      box[v] = b >> 1;
      box[v + 3] = (b >> 1) + 1;
      slots.push({ index: b, box });
    }
  }
  return slots.map((s) => ({ ...s, mask: boxMask(s.box) }));
}

/**
 * The pieces in a shaped cell: [{ index, box, mask }]. A slot counts only when
 * all of its sub-cubes are filled. A full block (shape 0) returns [].
 */
export function cellPieces(shape) {
  if (!shape) return [];
  const mask = shapeMask(shape);
  return pieceSlots(shapeKind(shape), shapeAxis(shape)).filter((p) => (mask & p.mask) === p.mask);
}

/** The piece of a shaped cell that contains sub-cube (sx, sy, sz), or null. */
export function pieceAt(shape, sx, sy, sz) {
  const bit = 1 << subIndex(sx, sy, sz);
  return cellPieces(shape).find((p) => p.mask & bit) || null;
}

/** Shape with one piece removed; 0 when nothing is left (the cell is empty). */
export function removePiece(shape, piece) {
  const mask = shapeMask(shape) & ~piece.mask;
  if (!mask) return 0;
  let partners = shapePartners(shape);
  if (shapeKind(shape) === SHAPE_KIND.PLANK) partners &= ~(1 << piece.index);
  return encodeShape(mask, shapeKind(shape), shapeAxis(shape), partners);
}

/**
 * For a plank half: which neighbour cell holds its other half, as a cell
 * offset [dx, dy, dz]. The other half is the same bar index there.
 */
export function plankPartnerOffset(shape, barIndex) {
  const axis = shapeAxis(shape);
  const plus = (shapePartners(shape) >> barIndex) & 1;
  const off = [0, 0, 0];
  off[axis] = plus ? 1 : -1;
  return off;
}

/** Sub-cube of a world point inside its cell (VOXEL_SIZE = 2: one unit each). */
export function subCubeOf(wx, wy, wz, voxelSize = 2) {
  const half = voxelSize / 2;
  const part = (n) => {
    const local = n - Math.floor(n / voxelSize) * voxelSize;
    return local >= half ? 1 : 0;
  };
  return [part(wx), part(wy), part(wz)];
}

/**
 * Top of the highest filled sub-cube in the sub-column (sx, sz) of a cell, in
 * sub-cube units above the cell's floor (0, 1 or 2), or -1 if that column is empty.
 */
export function columnTop(shape, sx, sz) {
  if (!shape) return 2;
  if (subFilled(shape, sx, 1, sz)) return 2;
  if (subFilled(shape, sx, 0, sz)) return 1;
  return -1;
}

/** Number of 1-unit sub-cubes a piece slot of this kind covers. */
export function pieceUnits(kind) {
  return kind === SHAPE_KIND.CUBES ? 1 : 4;
}

/** Handy builders for tests and the dev tool. */
export const shapes = {
  /** Slab: half 0 (the low side) or 1 along `axis` (y = floor/ceiling slab). */
  slab(axis = AXIS.Y, halves = [0]) {
    const slots = pieceSlots(SHAPE_KIND.SLAB, axis);
    const mask = halves.reduce((m, h) => m | slots[h].mask, 0);
    return encodeShape(mask, SHAPE_KIND.SLAB, axis);
  },
  /** Plank halves along `axis`; `bars` are bar indices, `plusSide` says where each partner is. */
  plank(axis = AXIS.X, bars = [0], plusSide = true) {
    const slots = pieceSlots(SHAPE_KIND.PLANK, axis);
    let mask = 0;
    let partners = 0;
    for (const b of bars) {
      mask |= slots[b].mask;
      if (plusSide) partners |= 1 << b;
    }
    return encodeShape(mask, SHAPE_KIND.PLANK, axis, partners);
  },
  /** Loose cubes: a fill mask. */
  cubes(mask) {
    return encodeShape(mask, SHAPE_KIND.CUBES, 0);
  },
};
