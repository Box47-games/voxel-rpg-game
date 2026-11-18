import {
  SHAPE_KIND, AXIS, encodeShape, shapeMask, shapeKind, shapeAxis, subFilled, subIndex,
  pieceSlots, cellPieces, pieceAt, removePiece, plankPartnerOffset, subCubeOf, columnTop, shapes,
} from '../cellShape';

describe('cellShape', () => {
  it('packs and unpacks', () => {
    const s = encodeShape(0x0f, SHAPE_KIND.SLAB, AXIS.Z);
    expect(shapeMask(s)).toBe(0x0f);
    expect(shapeKind(s)).toBe(SHAPE_KIND.SLAB);
    expect(shapeAxis(s)).toBe(AXIS.Z);
    expect(encodeShape(0, SHAPE_KIND.SLAB)).toBe(0);
  });

  it('a full block (shape 0) is filled everywhere and has no pieces', () => {
    expect(subFilled(0, 1, 1, 1)).toBe(true);
    expect(cellPieces(0)).toEqual([]);
    expect(columnTop(0, 0, 0)).toBe(2);
  });

  it('a bottom slab fills the lower layer', () => {
    const s = shapes.slab(AXIS.Y, [0]);
    expect(shapeMask(s)).toBe(0b00110011);
    expect(subFilled(s, 1, 0, 1)).toBe(true);
    expect(subFilled(s, 1, 1, 1)).toBe(false);
    expect(columnTop(s, 0, 1)).toBe(1);
    expect(cellPieces(s)).toHaveLength(1);
  });

  it('two slabs in a cell stay two pieces', () => {
    const s = shapes.slab(AXIS.Y, [0, 1]);
    expect(shapeMask(s)).toBe(0xff);
    expect(cellPieces(s)).toHaveLength(2);
    const top = pieceAt(s, 0, 1, 0);
    expect(top.box).toEqual([0, 1, 0, 2, 2, 2]);
    const left = removePiece(s, top);
    expect(left).toBe(shapes.slab(AXIS.Y, [0]));
    expect(removePiece(left, pieceAt(left, 0, 0, 0))).toBe(0);
  });

  it('slab slots along each axis cover half the cell', () => {
    for (const axis of [AXIS.X, AXIS.Y, AXIS.Z]) {
      const slots = pieceSlots(SHAPE_KIND.SLAB, axis);
      expect(slots).toHaveLength(2);
      expect(slots[0].mask | slots[1].mask).toBe(0xff);
      expect(slots[0].mask & slots[1].mask).toBe(0);
    }
  });

  it('plank bars run along their axis and know their partner side', () => {
    const s = shapes.plank(AXIS.X, [0, 3], true);
    const bars = cellPieces(s);
    expect(bars).toHaveLength(2);
    for (const b of bars) expect(b.box[3] - b.box[0]).toBe(2);
    expect(plankPartnerOffset(s, 0)).toEqual([1, 0, 0]);
    const minus = shapes.plank(AXIS.Z, [1], false);
    expect(plankPartnerOffset(minus, 1)).toEqual([0, 0, -1]);
    // Removing a bar clears its partner bit
    const one = removePiece(s, bars[1]);
    expect(cellPieces(one)).toHaveLength(1);
    expect((one >> 12) & 0xf).toBe(1);
  });

  it('cubes are single sub-cubes', () => {
    const s = shapes.cubes((1 << subIndex(1, 0, 1)) | (1 << subIndex(0, 1, 0)));
    expect(cellPieces(s)).toHaveLength(2);
    expect(pieceAt(s, 1, 0, 1).box).toEqual([1, 0, 1, 2, 1, 2]);
    expect(pieceAt(s, 0, 0, 0)).toBeNull();
    expect(columnTop(s, 0, 0)).toBe(2);
    expect(columnTop(s, 1, 0)).toBe(-1);
  });

  it('finds the sub-cube of a world point, negatives included', () => {
    expect(subCubeOf(0.5, 1.5, 3.2)).toEqual([0, 1, 1]);
    expect(subCubeOf(-0.5, -1.5, -2.5)).toEqual([1, 0, 1]);
  });
});
