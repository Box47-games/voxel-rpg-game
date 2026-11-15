/**
 * Terrain art in the chunk worker: world-space colors, grass sides,
 * decorations and the per-vertex campfire glow reaching the main thread.
 *
 * The worker is a self-contained classic script, so it is loaded here in a
 * sandbox with a fake `self` and its functions are called directly.
 */
import fs from 'fs';
import path from 'path';

const source = fs.readFileSync(path.resolve(__dirname, '../chunkWorker.js'), 'utf8');

function loadWorker() {
  const posted = [];
  const self = { postMessage: (msg) => posted.push(msg), onmessage: null };
  const api = new Function('self', `${source}
    return { buildChunkMesh, buildLODMesh, generateTerrain, vertexBaseColor, BlockTypes, CHUNK_SIZE, CHUNK_SIZE_Y };`)(self);
  return { ...api, self, posted };
}

const W = loadWorker();
const { BlockTypes: B, CHUNK_SIZE, CHUNK_SIZE_Y } = W;
const idx = (x, y, z) => x + (z << 4) + (y << 8);

/** A flat chunk: stone, dirt, then `surface` on top at y = 5. */
function flatChunk(surface = B.GRASS) {
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y);
  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let y = 0; y < 5; y++) blocks[idx(x, y, z)] = y < 3 ? B.STONE : B.DIRT;
      blocks[idx(x, 5, z)] = surface;
    }
  }
  return blocks;
}

/** Colors of the vertices at `y` (world units) facing `normalY`. */
function topColors(mesh, y) {
  const out = [];
  for (let v = 0; v < mesh.vertexCount; v++) {
    if (mesh.normals[v * 3 + 1] === 1 && mesh.positions[v * 3 + 1] === y) {
      out.push([mesh.colors[v * 3], mesh.colors[v * 3 + 1], mesh.colors[v * 3 + 2]]);
    }
  }
  return out;
}

describe('terrain colors', () => {
  test('grass tops are green; grass sides fade from green at the top to dirt below', () => {
    const c = [0, 0, 0];
    W.vertexBaseColor(B.GRASS, 'top', true, 0, 5, 0, 0, 6, 0, c);
    expect(c[1]).toBeGreaterThan(c[0] * 1.2);
    const lip = W.vertexBaseColor(B.GRASS, 'north', true, 0, 5, 0, 0, 6, 1, [0, 0, 0]);
    const base = W.vertexBaseColor(B.GRASS, 'north', false, 0, 5, 0, 0, 5, 1, [0, 0, 0]);
    expect(lip[1]).toBeGreaterThan(lip[0]);
    expect(base[0]).toBeGreaterThan(base[1]); // dirt brown
  });

  test('the same block looks the same in every chunk position (world-space, deterministic)', () => {
    const a = W.vertexBaseColor(B.STONE, 'top', true, 40, 3, 7, 40, 4, 7, [0, 0, 0]);
    const b = W.vertexBaseColor(B.STONE, 'top', true, 40, 3, 7, 40, 4, 7, [0, 0, 0]);
    expect(a).toEqual(b);
    // ...but two chunks don't repeat the same pattern
    const blocks = flatChunk();
    const m1 = W.buildChunkMesh({ blocks, chunkX: 0, chunkZ: 0 });
    const m2 = W.buildChunkMesh({ blocks, chunkX: 3, chunkZ: -2 });
    expect(topColors(m1, 12)).not.toEqual(topColors(m2, 12));
  });

  test('grass color varies across a meadow', () => {
    const greens = [];
    for (let x = 0; x < 200; x += 10) greens.push(W.vertexBaseColor(B.GRASS, 'top', true, x, 5, 0, x, 6, 0, [0, 0, 0])[0]);
    expect(Math.max(...greens) / Math.min(...greens)).toBeGreaterThan(1.5); // lusher and drier patches
  });

  test('tree trunks show rings on the ends and bark on the sides', () => {
    const ends = W.vertexBaseColor(B.WOOD, 'top', true, 1, 6, 1, 1, 7, 1, [0, 0, 0]);
    const bark = W.vertexBaseColor(B.WOOD, 'east', true, 1, 6, 1, 2, 7, 1, [0, 0, 0]);
    expect(ends[0]).toBeGreaterThan(bark[0] + 0.15);
  });

  test('vertices shared by neighbouring blocks get the same mottling', () => {
    // The corner (11, 6, 4) belongs to four grass blocks' top faces
    const corner = [[10, 3], [11, 3], [10, 4], [11, 4]].map(([bx, bz]) =>
      W.vertexBaseColor(B.GRASS, 'top', true, bx, 5, bz, 11, 6, 4, [0, 0, 0]));
    for (const c of corner) expect(c).toEqual(corner[0]);
    // ...while a different corner mottles differently
    expect(W.vertexBaseColor(B.GRASS, 'top', true, 10, 5, 3, 10, 6, 3, [0, 0, 0])).not.toEqual(corner[0]);
  });
});

describe('decorations', () => {
  test('grass gets tufts and flowers; bare stone gets none', () => {
    const grass = W.buildChunkMesh({ blocks: flatChunk(B.GRASS), chunkX: 2, chunkZ: 5 });
    expect(grass.decor.vertexCount).toBeGreaterThan(200);
    // Everything stands on the grass surface (y = 6 blocks = 12 units) or above
    for (let v = 0; v < grass.decor.vertexCount; v++) {
      expect(grass.decor.positions[v * 3 + 1]).toBeGreaterThanOrEqual(12 - 1e-6);
    }
    const stone = W.buildChunkMesh({ blocks: flatChunk(B.STONE), chunkX: 2, chunkZ: 5 });
    expect(stone.decor.vertexCount).toBe(0);
  });

  test('covered grass grows nothing', () => {
    const blocks = flatChunk(B.GRASS);
    for (let x = 0; x < CHUNK_SIZE; x++) for (let z = 0; z < CHUNK_SIZE; z++) blocks[idx(x, 6, z)] = B.STONE;
    expect(W.buildChunkMesh({ blocks }).decor.vertexCount).toBe(0);
  });

  test('decorations are stable across rebuilds', () => {
    const blocks = flatChunk(B.GRASS);
    const a = W.buildChunkMesh({ blocks, chunkX: 4, chunkZ: 4 }).decor;
    const b = W.buildChunkMesh({ blocks, chunkX: 4, chunkZ: 4 }).decor;
    expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  });

  test('berry bushes carry red berries', () => {
    const blocks = flatChunk(B.GRASS);
    blocks[idx(8, 6, 8)] = B.BERRY_BUSH;
    const { decor } = W.buildChunkMesh({ blocks, chunkX: 0, chunkZ: 0 });
    let red = 0;
    for (let v = 0; v < decor.vertexCount; v++) {
      const [r, g] = [decor.colors[v * 3], decor.colors[v * 3 + 1]];
      if (r > 0.5 && g < 0.25) red++;
    }
    expect(red).toBeGreaterThanOrEqual(4 * 20 * 0.5);
  });
});

describe('worker messages', () => {
  test('mesh results carry the campfire glow and decorations to the main thread', () => {
    const blocks = flatChunk(B.GRASS);
    blocks[idx(3, 6, 3)] = B.CAMPFIRE;
    W.posted.length = 0;
    W.self.onmessage({ data: { type: 'buildMesh', requestId: 7, blocks, chunkX: 0, chunkZ: 0 } });
    const msg = W.posted.find((m) => m.requestId === 7);
    expect(msg.type).toBe('meshComplete');
    expect(msg.emissive.length).toBe(msg.vertexCount);
    expect(Math.max(...msg.emissive)).toBe(1);
    expect(msg.decor.vertexCount).toBeGreaterThan(0);
  });

  test('LOD meshes use the same palette', () => {
    // A slab of grass thick enough that every merged cell is grass
    const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y);
    for (let i = 0; i < CHUNK_SIZE * CHUNK_SIZE * 8; i++) blocks[i] = B.GRASS;
    const lod = W.buildLODMesh({ blocks, lodLevel: 1, chunkX: 0, chunkZ: 0 });
    expect(lod.vertexCount).toBeGreaterThan(0);
    let greenTops = 0;
    let tops = 0;
    for (let v = 0; v < lod.vertexCount; v++) {
      if (lod.normals[v * 3 + 1] !== 1) continue;
      tops++;
      if (lod.colors[v * 3 + 1] > lod.colors[v * 3] * 1.2) greenTops++;
    }
    expect(greenTops).toBe(tops);
  });
});

describe('face winding', () => {
  /** Every triangle's front face (counter-clockwise) points along its vertex normal. */
  function expectFrontFacesOut(mesh) {
    const p = mesh.positions;
    const n = mesh.normals;
    const ix = mesh.indices;
    expect(ix.length).toBeGreaterThan(0);
    for (let t = 0; t < ix.length; t += 3) {
      const [a, b, c] = [ix[t], ix[t + 1], ix[t + 2]];
      const e1 = [p[b * 3] - p[a * 3], p[b * 3 + 1] - p[a * 3 + 1], p[b * 3 + 2] - p[a * 3 + 2]];
      const e2 = [p[c * 3] - p[a * 3], p[c * 3 + 1] - p[a * 3 + 1], p[c * 3 + 2] - p[a * 3 + 2]];
      const cross = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
      const dot = cross[0] * n[a * 3] + cross[1] * n[a * 3 + 1] + cross[2] * n[a * 3 + 2];
      expect(dot).toBeGreaterThan(0);
    }
  }

  test('terrain, LOD and decoration faces are wound so lighting sees their real side', () => {
    const blocks = flatChunk(B.GRASS);
    blocks[idx(8, 6, 8)] = B.WOOD; // a block with all six faces visible
    blocks[idx(8, 9, 8)] = B.STONE; // and one floating, to show its bottom
    const mesh = W.buildChunkMesh({ blocks, chunkX: 1, chunkZ: 2 });
    expectFrontFacesOut(mesh);
    expectFrontFacesOut(mesh.decor);
    expectFrontFacesOut(W.buildLODMesh({ blocks, lodLevel: 1 }));
  });
});
