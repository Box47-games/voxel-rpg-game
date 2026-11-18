/**
 * Shaped cells (pieces) in the chunk worker's mesher: each piece is its own
 * box with a seam, faces against full blocks are culled, and full blocks show
 * their faces toward pieces. Also checks the worker's copy of the
 * piece-cutting code matches src/systems/chunks/cellShape.js.
 */
import fs from 'fs';
import path from 'path';
import { cellPieces, encodeShape, shapes as S, AXIS, SHAPE_KIND } from '../../systems/chunks/cellShape';

const source = fs.readFileSync(path.resolve(__dirname, '../chunkWorker.js'), 'utf8');
const W = new Function('self', `${source}
  return { buildChunkMesh, shapePieceBoxes, BlockTypes, CHUNK_SIZE, CHUNK_SIZE_Y, PIECE_SEAM };`)({ postMessage() {} });
const { BlockTypes: B, CHUNK_SIZE, CHUNK_SIZE_Y, PIECE_SEAM } = W;
const N = CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y;
const idx = (x, y, z) => x + (z << 4) + (y << 8);

function mesh(cells, ground = false) {
  const blocks = new Uint8Array(N);
  const shapes = new Uint16Array(N);
  if (ground) for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks[idx(x, 0, z)] = B.STONE;
  for (const [x, y, z, type, shape] of cells) {
    blocks[idx(x, y, z)] = type;
    shapes[idx(x, y, z)] = shape || 0;
  }
  return W.buildChunkMesh({ blocks, shapes, chunkX: 0, chunkZ: 0 });
}

/** Faces whose centre lies strictly inside cell (x, y, z) (pieces are inset, block faces sit on the edge). */
function facesInCell(m, x, y, z) {
  let n = 0;
  for (let f = 0; f < m.vertexCount / 4; f++) {
    const c = [0, 0, 0];
    for (let k = 0; k < 4; k++) for (let a = 0; a < 3; a++) c[a] += m.positions[(f * 4 + k) * 3 + a] / 8;
    const rel = [c[0] - x, c[1] - y, c[2] - z];
    if (rel.every((r) => r > 1e-4 && r < 1 - 1e-4)) n++;
  }
  return n;
}

function bounds(m) {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.vertexCount; i++) {
    for (let a = 0; a < 3; a++) {
      min[a] = Math.min(min[a], m.positions[i * 3 + a]);
      max[a] = Math.max(max[a], m.positions[i * 3 + a]);
    }
  }
  return { min, max };
}

describe('chunk worker: shaped cells', () => {
  it("the worker's piece cutting matches cellShape.js for every mask", () => {
    const combos = [
      [SHAPE_KIND.CUBES, 0],
      ...[0, 1, 2].flatMap((a) => [[SHAPE_KIND.SLAB, a], [SHAPE_KIND.PLANK, a]]),
    ];
    for (const [kind, axis] of combos) {
      for (let mask = 1; mask < 256; mask++) {
        const shape = encodeShape(mask, kind, axis);
        expect(W.shapePieceBoxes(shape)).toEqual(cellPieces(shape).map((p) => p.box));
      }
    }
  });

  it('a lone floor slab is one box, half a block tall, inset by the seam', () => {
    const m = mesh([[4, 5, 4, B.STONE, S.slab(AXIS.Y, [0])]]);
    expect(m.faceCount).toBe(6);
    const { min, max } = bounds(m);
    expect(min[1]).toBeCloseTo(10 + PIECE_SEAM);
    expect(max[1]).toBeCloseTo(11 - PIECE_SEAM);
    expect(min[0]).toBeCloseTo(8 + PIECE_SEAM);
    expect(max[0]).toBeCloseTo(10 - PIECE_SEAM);
  });

  it('a slab on the ground skips its bottom; the ground shows its top under it', () => {
    const m = mesh([[4, 1, 4, B.STONE, S.slab(AXIS.Y, [0])]], true);
    expect(facesInCell(m, 4, 1, 4)).toBe(5);
    // Ground top faces: all 256 columns still draw a top face (the slab leaves a seam)
    let tops = 0;
    for (let f = 0; f < m.vertexCount / 4; f++) {
      const v = f * 4 * 3;
      if (m.normals[v + 1] === 1 && Math.abs(m.positions[v + 1] - 2) < 1e-6) tops++;
    }
    expect(tops).toBe(256);
  });

  it('two slabs in one cell draw as two boxes with a seam between', () => {
    const m = mesh([[4, 5, 4, B.STONE, S.slab(AXIS.Y, [0, 1])]]);
    expect(m.faceCount).toBe(12);
  });

  it('wall slabs (x and z) are thin along their axis', () => {
    for (const axis of [AXIS.X, AXIS.Z]) {
      const m = mesh([[4, 5, 4, B.STONE, S.slab(axis, [1])]]);
      const { min, max } = bounds(m);
      expect(max[axis] - min[axis]).toBeCloseTo(1 - 2 * PIECE_SEAM);
      expect(min[axis]).toBeCloseTo(9 + PIECE_SEAM);
    }
  });

  it('a plank half is a 2-long bar along its axis', () => {
    const m = mesh([[4, 5, 4, B.WOOD, S.plank(AXIS.X, [0])]]);
    expect(m.faceCount).toBe(6);
    const { min, max } = bounds(m);
    expect(max[0] - min[0]).toBeCloseTo(2 - 2 * PIECE_SEAM);
    expect(max[1] - min[1]).toBeCloseTo(1 - 2 * PIECE_SEAM);
  });

  it('a plank over two cells is one bar: no seam or end faces where the halves meet', () => {
    const m = mesh([
      [4, 5, 4, B.WOOD, S.plank(AXIS.X, [0], true)],
      [5, 5, 4, B.WOOD, S.plank(AXIS.X, [0], false)],
    ]);
    expect(m.faceCount).toBe(10);
    const { min, max } = bounds(m);
    expect(max[0] - min[0]).toBeCloseTo(4 - 2 * PIECE_SEAM);
  });

  it('a plank half whose other half is missing is closed at both ends', () => {
    const m = mesh([[4, 5, 4, B.WOOD, S.plank(AXIS.Z, [2], false)]]);
    expect(m.faceCount).toBe(6);
  });

  it('eight loose cubes draw 8 boxes', () => {
    const m = mesh([[4, 5, 4, B.DIRT, S.cubes(0xff)]]);
    expect(m.faceCount).toBe(48);
  });

  it('every cube mask draws 6 faces per cube in open air', () => {
    for (let mask = 1; mask < 256; mask++) {
      let bits = 0;
      for (let b = mask; b; b >>= 1) bits += b & 1;
      const m = mesh([[4, 5, 4, B.SAND, S.cubes(mask)]]);
      expect(m.faceCount).toBe(bits * 6);
    }
  });

  it('a full block shows its face toward a shaped neighbour', () => {
    const solid = mesh([[4, 5, 4, B.STONE], [5, 5, 4, B.STONE]]);
    const shaped = mesh([[4, 5, 4, B.STONE], [5, 5, 4, B.STONE, S.slab(AXIS.Y, [0])]]);
    // Two full blocks: 10 faces. Full block + slab: block gets all 6, slab skips its west side
    expect(solid.faceCount).toBe(10);
    expect(shaped.faceCount).toBe(6 + 5);
    expect(facesInCell(shaped, 5, 5, 4)).toBe(5);
  });

  it('shapes from a neighbour chunk show the border face', () => {
    const blocks = new Uint8Array(N);
    blocks[idx(15, 5, 4)] = B.STONE;
    const east = new Uint8Array(N);
    east[idx(0, 5, 4)] = B.STONE;
    const shapesEast = new Uint16Array(N);
    const base = W.buildChunkMesh({ blocks, neighborEast: east, chunkX: 0, chunkZ: 0 });
    shapesEast[idx(0, 5, 4)] = S.slab(AXIS.Y, [0]);
    const withShape = W.buildChunkMesh({ blocks, neighborEast: east, shapesEast, chunkX: 0, chunkZ: 0 });
    expect(withShape.faceCount).toBe(base.faceCount + 1);
  });

  it('chunks without shapes mesh exactly as before', () => {
    const blocks = new Uint8Array(N);
    for (let x = 0; x < 16; x++) for (let z = 0; z < 16; z++) blocks[idx(x, 0, z)] = B.STONE;
    const a = W.buildChunkMesh({ blocks, chunkX: 0, chunkZ: 0 });
    const b = W.buildChunkMesh({ blocks, shapes: new Uint16Array(N), chunkX: 0, chunkZ: 0 });
    expect(Array.from(b.positions)).toEqual(Array.from(a.positions));
  });
});
