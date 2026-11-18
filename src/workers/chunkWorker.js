/**
 * Chunk Worker - Web Worker for off-thread chunk operations
 *
 * Self-contained worker with all dependencies inlined.
 * CRA doesn't support ES module imports in workers properly.
 */

/* eslint-disable no-restricted-globals */

// ============================================================================
// CONSTANTS
// ============================================================================

const CHUNK_SIZE = 16;
const CHUNK_SIZE_Y = 32;
const VOXEL_SIZE = 2;

// Block types
const BlockTypes = {
  AIR: 0,
  STONE: 1,
  DIRT: 2,
  GRASS: 3,
  SAND: 4,
  WATER: 5,
  WOOD: 6,
  LEAVES: 7,
  BEDROCK: 8,
  GRAVEL: 9,
  COAL_ORE: 10,
  IRON_ORE: 11,
  GOLD_ORE: 12,
  CLAY: 13,
  SNOW: 14,
  ICE: 15,
  BERRY_BUSH: 16,
  CAMPFIRE: 17,
  CORRUPTED_STONE: 18,
  CORRUPTED_GRASS: 19,
  DEAD_LEAVES: 20,
  DEAD_WOOD: 21,
};

/**
 * Colors are authored as on-screen (sRGB) values; vertex colors are lit in
 * linear space, so convert once here. Without this every color renders pale.
 */
function srgbToLinear(c) {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}
function lin(rgb) {
  return [srgbToLinear(rgb[0]), srgbToLinear(rgb[1]), srgbToLinear(rgb[2])];
}

// Block colors [r, g, b] in 0-1 sRGB (base tones; see TERRAIN ART below for
// grass sides, meadow tints, bark and mottling), stored linear
const BlockColors = {
  [BlockTypes.AIR]: lin([0, 0, 0]),
  [BlockTypes.STONE]: lin([0.52, 0.53, 0.55]),
  [BlockTypes.DIRT]: lin([0.47, 0.32, 0.2]),
  [BlockTypes.GRASS]: lin([0.34, 0.6, 0.21]),
  [BlockTypes.SAND]: lin([0.87, 0.79, 0.56]),
  [BlockTypes.WATER]: lin([0.22, 0.45, 0.75]),
  [BlockTypes.WOOD]: lin([0.41, 0.28, 0.17]),
  [BlockTypes.LEAVES]: lin([0.24, 0.5, 0.19]),
  [BlockTypes.BEDROCK]: lin([0.17, 0.17, 0.19]),
  [BlockTypes.GRAVEL]: lin([0.56, 0.54, 0.51]),
  [BlockTypes.COAL_ORE]: lin([0.3, 0.3, 0.32]),
  [BlockTypes.IRON_ORE]: lin([0.64, 0.52, 0.43]),
  [BlockTypes.GOLD_ORE]: lin([0.86, 0.72, 0.27]),
  [BlockTypes.CLAY]: lin([0.62, 0.6, 0.66]),
  [BlockTypes.SNOW]: lin([0.94, 0.96, 1.0]),
  [BlockTypes.ICE]: lin([0.68, 0.84, 0.95]),
  [BlockTypes.BERRY_BUSH]: lin([0.2, 0.42, 0.17]),
  [BlockTypes.CAMPFIRE]: lin([0.9, 0.4, 0.1]),
  [BlockTypes.CORRUPTED_STONE]: lin([0.12, 0.05, 0.15]),
  [BlockTypes.CORRUPTED_GRASS]: lin([0.2, 0.3, 0.15]),
  [BlockTypes.DEAD_LEAVES]: lin([0.58, 0.42, 0.28]),
  [BlockTypes.DEAD_WOOD]: lin([0.3, 0.27, 0.3]),   // charred bark, violet-grey
};

// Transparent blocks
const TransparentBlocks = new Set([
  BlockTypes.AIR,
  BlockTypes.WATER,
  BlockTypes.LEAVES,
  BlockTypes.ICE,
  BlockTypes.DEAD_LEAVES,
]);

// Face definitions
const FACES = {
  top: {
    vertices: [[0, 1, 0], [1, 1, 0], [1, 1, 1], [0, 1, 1]],
    normal: [0, 1, 0],
  },
  bottom: {
    vertices: [[0, 0, 1], [1, 0, 1], [1, 0, 0], [0, 0, 0]],
    normal: [0, -1, 0],
  },
  north: {
    vertices: [[0, 0, 1], [0, 1, 1], [1, 1, 1], [1, 0, 1]],
    normal: [0, 0, 1],
  },
  south: {
    vertices: [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 0]],
    normal: [0, 0, -1],
  },
  east: {
    vertices: [[1, 0, 1], [1, 1, 1], [1, 1, 0], [1, 0, 0]],
    normal: [1, 0, 0],
  },
  west: {
    vertices: [[0, 0, 0], [0, 1, 0], [0, 1, 1], [0, 0, 1]],
    normal: [-1, 0, 0],
  },
};

// ============================================================================
// TERRAIN ART
// Purely visual: colors are computed per vertex from world coordinates, so
// they are seamless across chunk borders and identical on every rebuild.
// Nothing here changes which blocks exist.
// ============================================================================

// Gentle baked face shading: the scene's sun and sky light do most of the work
const FACE_LIGHT_BOTTOM = 0.6;
const FACE_LIGHT_NS = 0.9;
const FACE_LIGHT_EW = 0.84;

const GRASS_LUSH = lin([0.24, 0.5, 0.17]);
const GRASS_DRY = lin([0.46, 0.58, 0.22]);
const LEAF_DARK = lin([0.15, 0.4, 0.15]);
const LEAF_LIGHT = lin([0.34, 0.58, 0.21]);
const WOOD_RINGS = lin([0.68, 0.52, 0.33]);
const CORRUPT_SOIL = lin([0.2, 0.12, 0.18]);
const DEAD_WOOD_RINGS = lin([0.52, 0.47, 0.48]); // pale ash on cut ends
const CORRUPT_FLECK = lin([0.42, 0.16, 0.6]);    // violet crystal flecks in corrupted stone

// How much each block's color wobbles from vertex to vertex
const MOTTLE = {
  [BlockTypes.GRASS]: 0.13,
  [BlockTypes.LEAVES]: 0.12,
  [BlockTypes.BERRY_BUSH]: 0.12,
  [BlockTypes.DIRT]: 0.07,
  [BlockTypes.STONE]: 0.07,
  [BlockTypes.SAND]: 0.04,
  [BlockTypes.SNOW]: 0.02,
  [BlockTypes.GRAVEL]: 0.1,
  [BlockTypes.CLAY]: 0.05,
  [BlockTypes.WOOD]: 0.1,
  [BlockTypes.CORRUPTED_GRASS]: 0.08,
  [BlockTypes.CORRUPTED_STONE]: 0.12,
  [BlockTypes.DEAD_WOOD]: 0.16,
};

/** Deterministic hash of integer world coordinates → [0, 1). */
function hash3(x, y, z) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 1274126177)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** Smooth 2D value noise with the given cell size (in blocks) → [0, 1]. */
function valueNoise2(x, z, cell, salt) {
  const fx = x / cell;
  const fz = z / cell;
  const ix = Math.floor(fx);
  const iz = Math.floor(fz);
  let tx = fx - ix;
  let tz = fz - iz;
  tx = tx * tx * (3 - 2 * tx);
  tz = tz * tz * (3 - 2 * tz);
  const a = hash3(ix, salt, iz);
  const b = hash3(ix + 1, salt, iz);
  const c = hash3(ix, salt, iz + 1);
  const d = hash3(ix + 1, salt, iz + 1);
  return (a + (b - a) * tx) + ((c + (d - c) * tx) - (a + (b - a) * tx)) * tz;
}

/** Broad patches of lusher and drier ground (0 = lush, 1 = dry). */
function meadowTint(x, z) {
  return valueNoise2(x, z, 14, 11) * 0.75 + valueNoise2(x, z, 5, 23) * 0.25;
}

function mix3(a, b, t, out) {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
}

/**
 * Base color of one vertex of a block face, before lighting/AO.
 * (wx, wy, wz): the block's world block coordinates; (vx, vy, vz): the
 * vertex's world block coordinates (shared by neighbouring faces, so mottling
 * blends smoothly across a surface). vTop: the vertex is on the block's top edge.
 */
function vertexBaseColor(blockType, face, vTop, wx, wy, wz, vx, vy, vz, out) {
  const base = BlockColors[blockType] || [1, 0, 1];
  switch (blockType) {
    case BlockTypes.GRASS: {
      // Grass on top; the sides fade from a grassy lip down to dirt
      mix3(GRASS_LUSH, GRASS_DRY, meadowTint(vx, vz), out);
      if (face === 'bottom' || (face !== 'top' && !vTop)) {
        out[0] = BlockColors[BlockTypes.DIRT][0];
        out[1] = BlockColors[BlockTypes.DIRT][1];
        out[2] = BlockColors[BlockTypes.DIRT][2];
      } else if (face !== 'top') {
        out[0] *= 0.9; out[1] *= 0.9; out[2] *= 0.9;
      }
      break;
    }
    case BlockTypes.SNOW:
      if (face !== 'top' && !vTop) mix3(base, BlockColors[BlockTypes.DIRT], 0.55, out);
      else mix3(base, base, 0, out);
      break;
    case BlockTypes.CORRUPTED_GRASS:
      if (face !== 'top' && !vTop) mix3(CORRUPT_SOIL, CORRUPT_SOIL, 0, out);
      else mix3(base, base, 0, out);
      break;
    case BlockTypes.LEAVES:
    case BlockTypes.BERRY_BUSH: {
      // Each tree leans a little lighter or darker, and shades vary across the land
      const t = meadowTint(wx, wz) * 0.6 + hash3(wx, wy, wz) * 0.4;
      mix3(LEAF_DARK, LEAF_LIGHT, t, out);
      if (blockType === BlockTypes.BERRY_BUSH) { out[0] *= 0.85; out[1] *= 0.9; out[2] *= 0.85; }
      break;
    }
    case BlockTypes.WOOD:
      if (face === 'top' || face === 'bottom') mix3(WOOD_RINGS, WOOD_RINGS, 0, out);
      else mix3(base, base, 0, out);
      break;
    case BlockTypes.DEAD_WOOD:
      if (face === 'top' || face === 'bottom') mix3(DEAD_WOOD_RINGS, DEAD_WOOD_RINGS, 0, out);
      else mix3(base, base, 0, out);
      break;
    case BlockTypes.CORRUPTED_STONE:
      // A few vertices catch violet crystal flecks
      if (hash3(vx * 7, vy * 13, vz * 3) > 0.93) mix3(base, CORRUPT_FLECK, 0.8, out);
      else mix3(base, base, 0, out);
      break;
    default:
      out[0] = base[0]; out[1] = base[1]; out[2] = base[2];
  }

  const amp = MOTTLE[blockType] || 0.05;
  if (amp > 0) {
    // Bark streaks run vertically; everything else mottles in 3D
    const barky = blockType === BlockTypes.WOOD || blockType === BlockTypes.DEAD_WOOD;
    const n = barky && face !== 'top' && face !== 'bottom'
      ? hash3(vx * 3 + vz * 5, 0, 7)
      : hash3(vx, vy, vz);
    const m = 1 + (n - 0.5) * 2 * amp;
    out[0] *= m; out[1] *= m; out[2] *= m;
  }
  return out;
}

// ── Decorations ──────────────────────────────────────────────
// Small non-solid details (grass tufts, flowers, pebbles, berries) built into
// a separate mesh with no physics collider. They are derived from the blocks,
// so they vanish with the block under them on the next rebuild.

const FLOWER_COLORS = [
  lin([0.92, 0.26, 0.24]), // poppy red
  lin([0.98, 0.84, 0.25]), // buttercup yellow
  lin([0.96, 0.95, 0.9]),  // daisy white
  lin([0.62, 0.42, 0.86]), // violet
  lin([0.36, 0.58, 0.95]), // cornflower blue
];
const PEBBLE_COLOR = lin([0.6, 0.6, 0.6]);
const BERRY_COLOR = lin([0.8, 0.12, 0.22]);
const DEAD_TUFT = lin([0.32, 0.26, 0.3]);
const PEBBLE_TOP = lin([0.68, 0.68, 0.68]);
const SHELL_COLOR = lin([0.72, 0.66, 0.55]);
const SHELL_TOP = lin([0.8, 0.74, 0.62]);
const FLOWER_HEART = lin([0.98, 0.84, 0.32]);

/** Builder for the decoration mesh: boxes without bottoms, darker at the base. */
function createDecorBuilder(maxVertices) {
  const positions = new Float32Array(maxVertices * 3);
  const normals = new Float32Array(maxVertices * 3);
  const colors = new Float32Array(maxVertices * 3);
  const indices = [];
  let count = 0;

  const SIDE_SHADE = { top: 1.05, north: 0.85, south: 0.85, east: 0.78, west: 0.78 };
  const DECOR_FACES = ['top', 'north', 'south', 'east', 'west'];

  /** A box centered at (cx, cz) standing on y0, in chunk-local world units. */
  function box(cx, y0, cz, sx, sy, sz, color, topColor) {
    if (count + 20 > maxVertices) return;
    for (const face of DECOR_FACES) {
      const f = FACES[face];
      const start = count;
      for (let i = 0; i < 4; i++) {
        const v = f.vertices[i];
        const o = count * 3;
        positions[o] = cx + (v[0] - 0.5) * sx;
        positions[o + 1] = y0 + v[1] * sy;
        positions[o + 2] = cz + (v[2] - 0.5) * sz;
        normals[o] = f.normal[0];
        normals[o + 1] = f.normal[1];
        normals[o + 2] = f.normal[2];
        const c = v[1] === 1 && topColor ? topColor : color;
        const shade = SIDE_SHADE[face] * (v[1] === 1 ? 1 : 0.75); // grounded at the base
        colors[o] = Math.min(1, c[0] * shade);
        colors[o + 1] = Math.min(1, c[1] * shade);
        colors[o + 2] = Math.min(1, c[2] * shade);
        count++;
      }
      indices.push(start, start + 2, start + 1, start, start + 3, start + 2); // counter-clockwise: front faces out
    }
  }

  function result() {
    return {
      positions: positions.slice(0, count * 3),
      normals: normals.slice(0, count * 3),
      colors: colors.slice(0, count * 3),
      indices: new Uint32Array(indices),
      vertexCount: count,
    };
  }

  return { box, result };
}

/**
 * Add the decorations that sit on block (x, y, z) (chunk-local) with world
 * block coordinates (wx, wy, wz). `above` is the block on top of it.
 */
function decorateBlock(decor, blockType, above, x, y, z, wx, wy, wz) {
  const S = VOXEL_SIZE;
  const top = (y + 1) * S;
  const r = hash3(wx, wy, wz);
  const jx = (k) => x * S + S * (0.2 + hash3(wx, wy + k, wz + 97) * 0.6);
  const jz = (k) => z * S + S * (0.2 + hash3(wx + 53, wy + k, wz) * 0.6);

  if ((blockType === BlockTypes.GRASS || blockType === BlockTypes.CORRUPTED_GRASS) && above === BlockTypes.AIR) {
    const dead = blockType === BlockTypes.CORRUPTED_GRASS;
    const grass = dead ? DEAD_TUFT : mix3(GRASS_LUSH, GRASS_DRY, meadowTint(wx, wz), [0, 0, 0]);
    const tip = dead ? DEAD_TUFT : [grass[0] * 1.15 + 0.04, grass[1] * 1.12 + 0.04, grass[2] * 1.05];
    if (r < 0.3) {
      // A tuft of 2-4 blades
      const blades = 2 + Math.floor(hash3(wx, wy + 5, wz) * 3);
      const cx = jx(0);
      const cz = jz(0);
      for (let i = 0; i < blades; i++) {
        const h = S * (0.18 + hash3(wx + i, wy, wz + 11) * 0.22);
        const ox = (hash3(wx + i, wy + 2, wz) - 0.5) * S * 0.3;
        const oz = (hash3(wx, wy + 3, wz + i) - 0.5) * S * 0.3;
        decor.box(cx + ox, top, cz + oz, S * 0.06, h, S * 0.06, grass, tip);
      }
    } else if (!dead && r < 0.36) {
      // A flower: stem and petals
      const color = FLOWER_COLORS[Math.floor(hash3(wx, wy + 9, wz) * FLOWER_COLORS.length)];
      const cx = jx(1);
      const cz = jz(1);
      const h = S * (0.22 + hash3(wx, wy + 4, wz) * 0.12);
      decor.box(cx, top, cz, S * 0.04, h, S * 0.04, grass, grass);
      decor.box(cx, top + h, cz, S * 0.13, S * 0.08, S * 0.13, color, color);
      decor.box(cx, top + h + S * 0.08, cz, S * 0.05, S * 0.03, S * 0.05, FLOWER_HEART, FLOWER_HEART);
    } else if (r < 0.38) {
      decor.box(jx(2), top, jz(2), S * 0.2, S * 0.09, S * 0.15, PEBBLE_COLOR, PEBBLE_TOP);
    }
  } else if (blockType === BlockTypes.SAND && above === BlockTypes.AIR && r < 0.05) {
    decor.box(jx(2), top, jz(2), S * 0.16, S * 0.07, S * 0.12, SHELL_COLOR, SHELL_TOP);
  } else if (blockType === BlockTypes.BERRY_BUSH) {
    // Berries dotted over the top and sides of the bush, half sunk into the leaves
    const n = 4 + Math.floor(r * 4);
    const b = S * 0.12;
    for (let i = 0; i < n; i++) {
      const side = Math.floor(hash3(wx + i, wy, wz + 31) * 5);
      const u = x * S + S * (0.15 + hash3(wx, wy + i, wz + 41) * 0.7);
      const w = z * S + S * (0.15 + hash3(wx + 61, wy + i, wz) * 0.7);
      const h = y * S + S * (0.2 + hash3(wx + 7, wy + i, wz + 3) * 0.6);
      if (side === 0) {
        if (above === BlockTypes.AIR) decor.box(u, top - b / 2, w, b, b, b, BERRY_COLOR, BERRY_COLOR);
      } else if (side === 1) decor.box(x * S, h, w, b, b, b, BERRY_COLOR, BERRY_COLOR);
      else if (side === 2) decor.box((x + 1) * S, h, w, b, b, b, BERRY_COLOR, BERRY_COLOR);
      else if (side === 3) decor.box(u, h, z * S, b, b, b, BERRY_COLOR, BERRY_COLOR);
      else decor.box(u, h, (z + 1) * S, b, b, b, BERRY_COLOR, BERRY_COLOR);
    }
  }
}

// ============================================================================
// NOISE GENERATION
// ============================================================================

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 1103515245 + 12345) & 0x7fffffff;
    return this.seed / 0x7fffffff;
  }

  nextInt(min, max) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
}

class SimplexNoise {
  constructor(seed) {
    this.seed = seed;
    this.permutation = this.buildPermutation(seed);
  }

  buildPermutation(seed) {
    const perm = new Uint8Array(512);
    const random = new SeededRandom(seed);
    const p = new Uint8Array(256);

    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = random.nextInt(0, i);
      [p[i], p[j]] = [p[j], p[i]];
    }
    for (let i = 0; i < 512; i++) {
      perm[i] = p[i & 255];
    }
    return perm;
  }

  fade(t) {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  lerp(a, b, t) {
    return a + t * (b - a);
  }

  grad(hash, x, y) {
    const h = hash & 7;
    const u = h < 4 ? x : y;
    const v = h < 4 ? y : x;
    return ((h & 1) ? -u : u) + ((h & 2) ? -2.0 * v : 2.0 * v);
  }

  noise2D(x, y) {
    const perm = this.permutation;
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    x -= Math.floor(x);
    y -= Math.floor(y);
    const u = this.fade(x);
    const v = this.fade(y);
    const A = perm[X] + Y;
    const B = perm[X + 1] + Y;
    return this.lerp(
      this.lerp(this.grad(perm[A], x, y), this.grad(perm[B], x - 1, y), u),
      this.lerp(this.grad(perm[A + 1], x, y - 1), this.grad(perm[B + 1], x - 1, y - 1), u),
      v
    );
  }

  fbm(x, y, octaves = 4, lacunarity = 2, persistence = 0.5) {
    let value = 0;
    let amplitude = 1;
    let frequency = 1;
    let maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      value += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return value / maxValue;
  }
}

// ============================================================================
// RIFT CORRUPTION
// ============================================================================

// Corruption constants (mirrored from tuning.js)
const RIFT_DENSITY = 0.25;
const RIFT_MIN_SPAWN_DISTANCE = 96;
const RIFT_MIN_SEPARATION = 128;
const RIFT_CHUNK_SIZE_WORLD = 32; // world units per chunk (16 blocks * 2 voxel size)
const RIFT_GRID_RANGE = 8;

// Corruption radii in blocks
const CORRUPTION_RADIUS_FULL = 16;
const CORRUPTION_RADIUS_HEAVY = 28;
const CORRUPTION_RADIUS_LIGHT = 32;
// Chunk early-rejection distance in world units (CORRUPTION_RADIUS_LIGHT * VOXEL_SIZE + chunk diagonal)
const CORRUPTION_REJECT_DIST = 96;

// mulberry32 PRNG — identical to RiftManager.js
function mulberry32(seed) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Cache rift positions per seed (only ever one seed in practice)
let _cachedRiftSeed = null;
let _cachedRiftPositions = null;

function getRiftPositions(seed) {
  if (_cachedRiftSeed === seed) return _cachedRiftPositions;

  const rand = mulberry32(seed);
  const candidates = [];

  for (let cx = -RIFT_GRID_RANGE; cx <= RIFT_GRID_RANGE; cx++) {
    for (let cz = -RIFT_GRID_RANGE; cz <= RIFT_GRID_RANGE; cz++) {
      if (rand() > RIFT_DENSITY) continue;
      const x = cx * RIFT_CHUNK_SIZE_WORLD + rand() * RIFT_CHUNK_SIZE_WORLD;
      const z = cz * RIFT_CHUNK_SIZE_WORLD + rand() * RIFT_CHUNK_SIZE_WORLD;

      // Check min distance from player spawn (0,0)
      if (Math.sqrt(x * x + z * z) < RIFT_MIN_SPAWN_DISTANCE) continue;
      candidates.push({ x, z });
    }
  }

  // Filter by minimum separation
  const accepted = [];
  for (const c of candidates) {
    let tooClose = false;
    for (const a of accepted) {
      const dx = c.x - a.x;
      const dz = c.z - a.z;
      if (Math.sqrt(dx * dx + dz * dz) < RIFT_MIN_SEPARATION) {
        tooClose = true;
        break;
      }
    }
    if (!tooClose) accepted.push(c);
  }

  _cachedRiftSeed = seed;
  _cachedRiftPositions = accepted;
  return accepted;
}

function getRiftsNearChunk(riftPositions, chunkX, chunkZ) {
  // Chunk center in world units
  const centerX = chunkX * CHUNK_SIZE * VOXEL_SIZE + CHUNK_SIZE;
  const centerZ = chunkZ * CHUNK_SIZE * VOXEL_SIZE + CHUNK_SIZE;
  const nearby = [];
  for (const rift of riftPositions) {
    const dx = rift.x - centerX;
    const dz = rift.z - centerZ;
    if (Math.abs(dx) < CORRUPTION_REJECT_DIST && Math.abs(dz) < CORRUPTION_REJECT_DIST) {
      nearby.push(rift);
    }
  }
  return nearby;
}

// Deterministic hash for corruption probability (stable across chunk boundaries)
function corruptionHash(wx, wz) {
  let h = (wx * 374761393 + wz * 1274126177) | 0;
  h = ((h ^ (h >> 13)) * 1103515245) | 0;
  return (h & 0x7fffffff) / 0x7fffffff;
}

function applyCorruption(blocks, chunkX, chunkZ, nearbyRifts) {
  if (nearbyRifts.length === 0) return;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      // World position in blocks, then convert to world units for distance
      const worldX = (chunkX * CHUNK_SIZE + x) * VOXEL_SIZE;
      const worldZ = (chunkZ * CHUNK_SIZE + z) * VOXEL_SIZE;

      // Find minimum distance to any rift (in blocks)
      let minDist = Infinity;
      for (const rift of nearbyRifts) {
        const dx = worldX - rift.x;
        const dz = worldZ - rift.z;
        const distWorld = Math.sqrt(dx * dx + dz * dz);
        const distBlocks = distWorld / VOXEL_SIZE;
        if (distBlocks < minDist) minDist = distBlocks;
      }

      if (minDist > CORRUPTION_RADIUS_LIGHT) continue;

      const wx = chunkX * CHUNK_SIZE + x;
      const wz = chunkZ * CHUNK_SIZE + z;

      // Z1: 0-16 blocks, 100% → CORRUPTED_STONE
      if (minDist <= CORRUPTION_RADIUS_FULL) {
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const index = x + (z << 4) + (y << 8);
          const block = blocks[index];
          if (block === BlockTypes.GRASS || block === BlockTypes.DIRT ||
              block === BlockTypes.SAND || block === BlockTypes.SNOW ||
              block === BlockTypes.CLAY || block === BlockTypes.STONE) {
            blocks[index] = BlockTypes.CORRUPTED_STONE;
          } else if (block === BlockTypes.WOOD) {
            blocks[index] = BlockTypes.DEAD_WOOD;
          } else if (block === BlockTypes.LEAVES || block === BlockTypes.BERRY_BUSH) {
            blocks[index] = BlockTypes.AIR;
          }
        }
        continue;
      }

      // Z2: 17-28 blocks — 80% CORRUPTED_STONE / 20% CORRUPTED_GRASS, gray trunks, no leaves
      if (minDist <= CORRUPTION_RADIUS_HEAVY) {
        const roll2 = corruptionHash(wx, wz);
        const toCorruptedStone = roll2 < 0.80;
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const index = x + (z << 4) + (y << 8);
          const block = blocks[index];
          if (block === BlockTypes.GRASS || block === BlockTypes.DIRT ||
              block === BlockTypes.SAND || block === BlockTypes.SNOW ||
              block === BlockTypes.CLAY || block === BlockTypes.STONE) {
            blocks[index] = toCorruptedStone ? BlockTypes.CORRUPTED_STONE : BlockTypes.CORRUPTED_GRASS;
          } else if (block === BlockTypes.WOOD) {
            blocks[index] = BlockTypes.DEAD_WOOD;
          } else if (block === BlockTypes.LEAVES || block === BlockTypes.BERRY_BUSH) {
            blocks[index] = BlockTypes.AIR;
          }
        }
      }

      // Z3: 29-32 blocks — all leaves/bushes die, 50% ground → CORRUPTED_GRASS
      if (minDist > CORRUPTION_RADIUS_HEAVY) {
        const roll3 = corruptionHash(wx + 7919, wz + 31337);
        for (let y = 0; y < CHUNK_SIZE_Y; y++) {
          const index = x + (z << 4) + (y << 8);
          const block = blocks[index];
          if (block === BlockTypes.LEAVES || block === BlockTypes.BERRY_BUSH) {
            blocks[index] = BlockTypes.DEAD_LEAVES;
          } else if (roll3 < 0.50 && (block === BlockTypes.GRASS || block === BlockTypes.DIRT ||
              block === BlockTypes.SAND || block === BlockTypes.SNOW)) {
            blocks[index] = BlockTypes.CORRUPTED_GRASS;
          }
        }
      }
    }
  }
}

// ============================================================================
// TERRAIN GENERATION
// ============================================================================

function generateTerrain(params) {
  const { chunkX, chunkZ, seed } = params;
  const noise = new SimplexNoise(seed);
  const random = new SeededRandom(seed + chunkX * 31337 + chunkZ * 7919);
  const blocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE * CHUNK_SIZE_Y);

  // Terrain parameters - deep underground for stone/iron/gold
  const seaLevel = 8;
  const baseHeight = 24;
  const heightVariation = 6;

  for (let x = 0; x < CHUNK_SIZE; x++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      const worldX = chunkX * CHUNK_SIZE + x;
      const worldZ = chunkZ * CHUNK_SIZE + z;

      const heightNoise = noise.fbm(worldX * 0.02, worldZ * 0.02, 4, 2, 0.5);
      const height = Math.floor(baseHeight + heightNoise * heightVariation);

      const temperature = noise.fbm(worldX * 0.005 + 1000, worldZ * 0.005, 2);
      const moisture = noise.fbm(worldX * 0.005 + 2000, worldZ * 0.005 + 1000, 2);

      let surfaceBlock = BlockTypes.GRASS;
      let subsurfaceBlock = BlockTypes.DIRT;

      if (temperature < -0.3) {
        surfaceBlock = BlockTypes.SNOW;
      } else if (temperature > 0.3 && moisture < -0.2) {
        surfaceBlock = BlockTypes.SAND;
        subsurfaceBlock = BlockTypes.SAND;
      } else if (moisture > 0.3 && height <= seaLevel + 1) {
        surfaceBlock = BlockTypes.CLAY;
      }

      for (let y = 0; y < CHUNK_SIZE_Y; y++) {
        const index = x + (z << 4) + (y << 8);
        let blockType = BlockTypes.AIR;

        if (y === 0) {
          blockType = BlockTypes.BEDROCK;
        } else if (y < height - 4) {
          blockType = BlockTypes.STONE;
          const oreNoise = noise.noise2D(worldX * 0.1 + y * 0.1, worldZ * 0.1);
          if (y < 10 && oreNoise > 0.7 && random.next() < 0.3) {
            blockType = BlockTypes.GOLD_ORE;
          } else if (y < 16 && oreNoise > 0.6 && random.next() < 0.4) {
            blockType = BlockTypes.IRON_ORE;
          } else if (oreNoise > 0.5 && random.next() < 0.5) {
            blockType = BlockTypes.COAL_ORE;
          }
        } else if (y < height) {
          blockType = subsurfaceBlock;
        } else if (y === height) {
          blockType = surfaceBlock;
        } else if (y <= seaLevel && height < seaLevel) {
          blockType = BlockTypes.WATER;
        }

        blocks[index] = blockType;
      }

      // Trees
      if (surfaceBlock === BlockTypes.GRASS &&
          height > seaLevel &&
          height < CHUNK_SIZE_Y - 5 &&
          random.next() < 0.02) {
        generateTree(blocks, x, height + 1, z, random);
      }

      // Berry bushes — spawn on grass if no tree above
      if (surfaceBlock === BlockTypes.GRASS &&
          height > seaLevel &&
          height + 1 < CHUNK_SIZE_Y &&
          blocks[x + (z << 4) + ((height + 1) << 8)] === BlockTypes.AIR &&
          random.next() < 0.03) {
        blocks[x + (z << 4) + ((height + 1) << 8)] = BlockTypes.BERRY_BUSH;
      }
    }
  }

  // Rift corruption pass — runs after trees + bushes so dead trees emerge naturally
  const riftPositions = getRiftPositions(seed);
  const nearbyRifts = getRiftsNearChunk(riftPositions, chunkX, chunkZ);
  applyCorruption(blocks, chunkX, chunkZ, nearbyRifts);

  return { blocks, chunkX, chunkZ };
}

function generateTree(blocks, x, baseY, z, random) {
  const trunkHeight = random.nextInt(3, 5);
  if (baseY + trunkHeight + 2 >= CHUNK_SIZE_Y) return;
  if (x < 2 || x >= CHUNK_SIZE - 2 || z < 2 || z >= CHUNK_SIZE - 2) return;

  for (let y = 0; y < trunkHeight; y++) {
    blocks[x + (z << 4) + ((baseY + y) << 8)] = BlockTypes.WOOD;
  }

  const leafY = baseY + trunkHeight;
  for (let dy = 0; dy <= 2; dy++) {
    const radius = dy === 2 ? 1 : 2;
    for (let dx = -radius; dx <= radius; dx++) {
      for (let dz = -radius; dz <= radius; dz++) {
        const lx = x + dx, ly = leafY + dy, lz = z + dz;
        if (lx >= 0 && lx < CHUNK_SIZE && ly >= 0 && ly < CHUNK_SIZE_Y && lz >= 0 && lz < CHUNK_SIZE) {
          const dist = Math.abs(dx) + Math.abs(dz);
          if (dist <= radius && random.next() > 0.2) {
            const index = lx + (lz << 4) + (ly << 8);
            if (blocks[index] === BlockTypes.AIR) {
              blocks[index] = BlockTypes.LEAVES;
            }
          }
        }
      }
    }
  }
}

// ============================================================================
// MESH BUILDING
// ============================================================================

// Shaped cells (pieces). A copy of the cutting code in
// src/systems/chunks/cellShape.js (this classic worker can't import it);
// a test checks the two agree. Shape: bits 0-7 fill mask (bit sx + sy*2 + sz*4),
// bits 8-9 kind (1 slab, 2 plank, 3 cubes), bits 10-11 axis.
const SHAPE_SLAB = 1;
const SHAPE_PLANK = 2;
const SHAPE_CUBES = 3;
// Gap left around each piece so pieces read as pieces (world units)
const PIECE_SEAM = 0.04;

function shapeSlotBoxes(kind, axis) {
  const boxes = [];
  if (kind === SHAPE_CUBES) {
    for (let i = 0; i < 8; i++) {
      const sx = i & 1, sy = (i >> 1) & 1, sz = (i >> 2) & 1;
      boxes.push([sx, sy, sz, sx + 1, sy + 1, sz + 1]);
    }
  } else if (kind === SHAPE_SLAB) {
    for (let h = 0; h < 2; h++) {
      const box = [0, 0, 0, 2, 2, 2];
      box[axis] = h;
      box[axis + 3] = h + 1;
      boxes.push(box);
    }
  } else if (kind === SHAPE_PLANK) {
    const u = axis === 0 ? 1 : 0;
    const v = axis === 2 ? 1 : 2;
    for (let b = 0; b < 4; b++) {
      const box = [0, 0, 0, 2, 2, 2];
      box[u] = b & 1;
      box[u + 3] = (b & 1) + 1;
      box[v] = b >> 1;
      box[v + 3] = (b >> 1) + 1;
      boxes.push(box);
    }
  }
  return boxes;
}

function boxMaskOf(box) {
  let m = 0;
  for (let sz = box[2]; sz < box[5]; sz++) {
    for (let sy = box[1]; sy < box[4]; sy++) {
      for (let sx = box[0]; sx < box[3]; sx++) m |= 1 << (sx + sy * 2 + sz * 4);
    }
  }
  return m;
}

/** Boxes ([x0, y0, z0, x1, y1, z1] in half-cell units) of the pieces in a shaped cell. */
function shapePieceBoxes(shape) {
  const mask = shape & 0xff;
  const kind = (shape >> 8) & 3;
  const axis = (shape >> 10) & 3;
  const out = [];
  const boxes = shapeSlotBoxes(kind, axis);
  for (let i = 0; i < boxes.length; i++) {
    const m = boxMaskOf(boxes[i]);
    if ((mask & m) === m) out.push(boxes[i]);
  }
  return out;
}

/** Bar index (0-3) of a plank box: its position on the two axes across the plank. */
function plankBarIndex(box, axis) {
  const u = axis === 0 ? 1 : 0;
  const v = axis === 2 ? 1 : 2;
  return box[u] + box[v] * 2;
}

// Which box side lies on each face, and the neighbour cell across it
const FACE_SIDE = {
  top: { axis: 1, max: true, d: [0, 1, 0] },
  bottom: { axis: 1, max: false, d: [0, -1, 0] },
  north: { axis: 2, max: true, d: [0, 0, 1] },
  south: { axis: 2, max: false, d: [0, 0, -1] },
  east: { axis: 0, max: true, d: [1, 0, 0] },
  west: { axis: 0, max: false, d: [-1, 0, 0] },
};
const FACE_NAMES = ['top', 'bottom', 'north', 'south', 'east', 'west'];
const SEAM_ALL = [PIECE_SEAM, PIECE_SEAM, PIECE_SEAM, PIECE_SEAM, PIECE_SEAM, PIECE_SEAM];

function buildChunkMesh(params) {
  const { blocks, neighborNorth, neighborSouth, neighborEast, neighborWest } = params;
  // Shaped cells (pieces): null when a chunk has none
  const shapes = params.shapes || null;
  const shapesNorth = params.shapesNorth || null;
  const shapesSouth = params.shapesSouth || null;
  const shapesEast = params.shapesEast || null;
  const shapesWest = params.shapesWest || null;
  // Plain terrain (no pieces here or next door) skips every shape lookup
  const anyShapes = !!(shapes || shapesNorth || shapesSouth || shapesEast || shapesWest);
  // World block offset of this chunk (colors and decorations use world coordinates)
  const baseX = (params.chunkX || 0) * CHUNK_SIZE;
  const baseZ = (params.chunkZ || 0) * CHUNK_SIZE;
  const decor = createDecorBuilder(16000);
  const vertexColor = [0, 0, 0];

  const maxVertices = 40000;
  const positions = new Float32Array(maxVertices * 3);
  const normals = new Float32Array(maxVertices * 3);
  const colors = new Float32Array(maxVertices * 3);
  const emissive = new Float32Array(maxVertices);  // per-vertex emissive factor (0=none, 1=full glow)
  const indices = [];
  let vertexCount = 0;

  function getBlock(x, y, z) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return BlockTypes.AIR;
    if (x < 0) {
      if (!neighborWest) return BlockTypes.AIR;
      return neighborWest[(CHUNK_SIZE - 1) + (z << 4) + (y << 8)];
    }
    if (x >= CHUNK_SIZE) {
      if (!neighborEast) return BlockTypes.AIR;
      return neighborEast[0 + (z << 4) + (y << 8)];
    }
    if (z < 0) {
      if (!neighborSouth) return BlockTypes.AIR;
      return neighborSouth[x + ((CHUNK_SIZE - 1) << 4) + (y << 8)];
    }
    if (z >= CHUNK_SIZE) {
      if (!neighborNorth) return BlockTypes.AIR;
      return neighborNorth[x + (0 << 4) + (y << 8)];
    }
    return blocks[x + (z << 4) + (y << 8)];
  }

  function getShape(x, y, z) {
    if (y < 0 || y >= CHUNK_SIZE_Y) return 0;
    if (x < 0) return shapesWest ? shapesWest[(CHUNK_SIZE - 1) + (z << 4) + (y << 8)] : 0;
    if (x >= CHUNK_SIZE) return shapesEast ? shapesEast[0 + (z << 4) + (y << 8)] : 0;
    if (z < 0) return shapesSouth ? shapesSouth[x + ((CHUNK_SIZE - 1) << 4) + (y << 8)] : 0;
    if (z >= CHUNK_SIZE) return shapesNorth ? shapesNorth[x + (0 << 4) + (y << 8)] : 0;
    return shapes ? shapes[x + (z << 4) + (y << 8)] : 0;
  }

  /** Face of a full block toward (nx, ny, nz): open neighbours, and shaped cells (pieces leave gaps). */
  function fullFaceVisible(blockType, nx, ny, nz) {
    const adjacent = getBlock(nx, ny, nz);
    if (shouldRenderFace(blockType, adjacent)) return true;
    return anyShapes && adjacent !== BlockTypes.AIR && getShape(nx, ny, nz) !== 0;
  }

  function shouldRenderFace(blockType, adjacentType) {
    if (blockType === BlockTypes.AIR) return false;
    if (TransparentBlocks.has(adjacentType)) {
      if (blockType === adjacentType) return false;
      return true;
    }
    return false;
  }

  function isSolidForAO(x, y, z) {
    if (anyShapes && getShape(x, y, z) !== 0) return false; // pieces are thinner than a block
    const b = getBlock(x, y, z);
    return b !== BlockTypes.AIR && b !== BlockTypes.WATER && b !== BlockTypes.LEAVES && b !== BlockTypes.ICE && b !== BlockTypes.DEAD_LEAVES;
  }

  // AO neighbor offsets per face per vertex: [side1, side2, corner]
  // Each is [dx, dy, dz] relative to the block position
  const AO_OFFSETS = {
    top: [ // +Y face, vertices at y+1
      [[-1,1,0],[0,1,-1],[-1,1,-1]], // v0 (0,1,0)
      [[1,1,0],[0,1,-1],[1,1,-1]],   // v1 (1,1,0)
      [[1,1,0],[0,1,1],[1,1,1]],     // v2 (1,1,1)
      [[-1,1,0],[0,1,1],[-1,1,1]],   // v3 (0,1,1)
    ],
    bottom: [ // -Y face, vertices at y-1
      [[-1,-1,0],[0,-1,1],[-1,-1,1]],  // v0 (0,0,1)
      [[1,-1,0],[0,-1,1],[1,-1,1]],    // v1 (1,0,1)
      [[1,-1,0],[0,-1,-1],[1,-1,-1]],  // v2 (1,0,0)
      [[-1,-1,0],[0,-1,-1],[-1,-1,-1]],// v3 (0,0,0)
    ],
    north: [ // +Z face, vertices at z+1
      [[-1,0,1],[0,-1,1],[-1,-1,1]],  // v0 (0,0,1)
      [[-1,0,1],[0,1,1],[-1,1,1]],    // v1 (0,1,1)
      [[1,0,1],[0,1,1],[1,1,1]],      // v2 (1,1,1)
      [[1,0,1],[0,-1,1],[1,-1,1]],    // v3 (1,0,1)
    ],
    south: [ // -Z face, vertices at z-1
      [[1,0,-1],[0,-1,-1],[1,-1,-1]],  // v0 (1,0,0)
      [[1,0,-1],[0,1,-1],[1,1,-1]],    // v1 (1,1,0)
      [[-1,0,-1],[0,1,-1],[-1,1,-1]],  // v2 (0,1,0)
      [[-1,0,-1],[0,-1,-1],[-1,-1,-1]],// v3 (0,0,0)
    ],
    east: [ // +X face, vertices at x+1
      [[1,0,1],[1,-1,0],[1,-1,1]],    // v0 (1,0,1)
      [[1,0,1],[1,1,0],[1,1,1]],      // v1 (1,1,1)
      [[1,0,-1],[1,1,0],[1,1,-1]],    // v2 (1,1,0)
      [[1,0,-1],[1,-1,0],[1,-1,-1]],  // v3 (1,0,0)
    ],
    west: [ // -X face, vertices at x-1
      [[-1,0,-1],[-1,-1,0],[-1,-1,-1]], // v0 (0,0,0)
      [[-1,0,-1],[-1,1,0],[-1,1,-1]],   // v1 (0,1,0)
      [[-1,0,1],[-1,1,0],[-1,1,1]],     // v2 (0,1,1)
      [[-1,0,1],[-1,-1,0],[-1,-1,1]],   // v3 (0,0,1)
    ],
  };

  const AO_BRIGHTNESS = [0.5, 0.65, 0.8, 1.0];

  // Simple hash for per-block color variation (deterministic, no allocations)
  function blockHash(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return (h & 0x7fffffff) / 0x7fffffff; // 0.0–1.0
  }

  // Pre-scan for campfire positions in chunk AND neighbor edges (for warm glow)
  const campfirePositions = [];
  const CAMPFIRE_GLOW_RADIUS = 5;
  // Scan own chunk
  for (let cy = 0; cy < CHUNK_SIZE_Y; cy++) {
    for (let cz = 0; cz < CHUNK_SIZE; cz++) {
      for (let cx = 0; cx < CHUNK_SIZE; cx++) {
        if (blocks[cx + (cz << 4) + (cy << 8)] === BlockTypes.CAMPFIRE) {
          campfirePositions.push(cx, cy, cz);
        }
      }
    }
  }
  // Scan neighbor chunk edges for campfires within glow radius of boundary
  // Positions are stored in local-space coordinates (negative or >= CHUNK_SIZE)
  const R = CAMPFIRE_GLOW_RADIUS;
  if (neighborWest) {
    for (let cy = 0; cy < CHUNK_SIZE_Y; cy++) {
      for (let cz = 0; cz < CHUNK_SIZE; cz++) {
        for (let cx = CHUNK_SIZE - R; cx < CHUNK_SIZE; cx++) {
          if (neighborWest[cx + (cz << 4) + (cy << 8)] === BlockTypes.CAMPFIRE) {
            campfirePositions.push(cx - CHUNK_SIZE, cy, cz);
          }
        }
      }
    }
  }
  if (neighborEast) {
    for (let cy = 0; cy < CHUNK_SIZE_Y; cy++) {
      for (let cz = 0; cz < CHUNK_SIZE; cz++) {
        for (let cx = 0; cx < R; cx++) {
          if (neighborEast[cx + (cz << 4) + (cy << 8)] === BlockTypes.CAMPFIRE) {
            campfirePositions.push(cx + CHUNK_SIZE, cy, cz);
          }
        }
      }
    }
  }
  if (neighborSouth) {
    for (let cy = 0; cy < CHUNK_SIZE_Y; cy++) {
      for (let cz = CHUNK_SIZE - R; cz < CHUNK_SIZE; cz++) {
        for (let cx = 0; cx < CHUNK_SIZE; cx++) {
          if (neighborSouth[cx + (cz << 4) + (cy << 8)] === BlockTypes.CAMPFIRE) {
            campfirePositions.push(cx, cy, cz - CHUNK_SIZE);
          }
        }
      }
    }
  }
  if (neighborNorth) {
    for (let cy = 0; cy < CHUNK_SIZE_Y; cy++) {
      for (let cz = 0; cz < R; cz++) {
        for (let cx = 0; cx < CHUNK_SIZE; cx++) {
          if (neighborNorth[cx + (cz << 4) + (cy << 8)] === BlockTypes.CAMPFIRE) {
            campfirePositions.push(cx, cy, cz + CHUNK_SIZE);
          }
        }
      }
    }
  }

  function getCampfireGlow(x, y, z) {
    let glow = 0;
    for (let i = 0; i < campfirePositions.length; i += 3) {
      const dx = x - campfirePositions[i];
      const dy = y - campfirePositions[i + 1];
      const dz = z - campfirePositions[i + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < CAMPFIRE_GLOW_RADIUS && dist > 0) {
        glow = Math.max(glow, 1.0 - dist / CAMPFIRE_GLOW_RADIUS);
      }
    }
    return glow;
  }

  // box: optional piece box [x0, y0, z0, x1, y1, z1] in half-cell units
  // (0..2) — the face is drawn on that box, shrunk by PIECE_SEAM, without AO.
  // inset: optional per-side shrink [x0, y0, z0, x1, y1, z1] (default PIECE_SEAM)
  function addFace(x, y, z, face, blockType, box, inset) {
    if (vertexCount + 4 > maxVertices) return;

    const faceData = FACES[face];
    const wx = baseX + x;
    const wz = baseZ + z;

    // Light baked per face, on top of the scene's sun and sky light
    let lightMod = 1.0;
    if (face === 'bottom') lightMod = FACE_LIGHT_BOTTOM;
    else if (face === 'north' || face === 'south') lightMod = FACE_LIGHT_NS;
    else if (face === 'east' || face === 'west') lightMod = FACE_LIGHT_EW;

    // Height-based brightness: lower blocks are slightly darker, higher are brighter
    // Range: ~0.88 at y=0 to ~1.08 at y=15 (subtle but visible at elevation changes)
    const heightMod = 0.88 + (y / CHUNK_SIZE_Y) * 0.20;

    // Per-block noise: ±4% brightness variation to break up uniform surfaces
    const noiseMod = 0.96 + hash3(wx, y, wz) * 0.08;

    // Warm glow from nearby campfires
    const campGlow = campfirePositions.length > 0 ? getCampfireGlow(x, y, z) : 0;

    const aoOffsets = AO_OFFSETS[face];
    const startVertex = vertexCount;

    for (let i = 0; i < 4; i++) {
      const v = faceData.vertices[i];
      const idx = vertexCount * 3;

      // Vertex position in cells (fractional on a piece)
      let fx = v[0], fy = v[1], fz = v[2];
      if (box) {
        fx = (v[0] ? box[3] : box[0]) / 2;
        fy = (v[1] ? box[4] : box[1]) / 2;
        fz = (v[2] ? box[5] : box[2]) / 2;
        const ins = inset || SEAM_ALL;
        positions[idx] = (x + fx) * VOXEL_SIZE + (v[0] ? -ins[3] : ins[0]);
        positions[idx + 1] = (y + fy) * VOXEL_SIZE + (v[1] ? -ins[4] : ins[1]);
        positions[idx + 2] = (z + fz) * VOXEL_SIZE + (v[2] ? -ins[5] : ins[2]);
      } else {
        positions[idx] = (x + v[0]) * VOXEL_SIZE;
        positions[idx + 1] = (y + v[1]) * VOXEL_SIZE;
        positions[idx + 2] = (z + v[2]) * VOXEL_SIZE;
      }

      normals[idx] = faceData.normal[0];
      normals[idx + 1] = faceData.normal[1];
      normals[idx + 2] = faceData.normal[2];

      // Compute per-vertex AO
      let aoMod = 1;
      if (!box) {
        const offsets = aoOffsets[i];
        const s1 = isSolidForAO(x + offsets[0][0], y + offsets[0][1], z + offsets[0][2]);
        const s2 = isSolidForAO(x + offsets[1][0], y + offsets[1][1], z + offsets[1][2]);
        const cn = isSolidForAO(x + offsets[2][0], y + offsets[2][1], z + offsets[2][2]);
        const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);
        aoMod = AO_BRIGHTNESS[ao];
      }

      // Campfire blocks glow — skip darkening, boost brightness with flicker
      if (blockType === BlockTypes.CAMPFIRE) {
        const flicker = 0.9 + blockHash(x + i, y, z + i) * 0.2; // 0.9–1.1
        colors[idx] = Math.min(1, 1.2 * flicker);       // bright yellow-white
        colors[idx + 1] = Math.min(1, 0.7 * flicker);
        colors[idx + 2] = Math.min(1, 0.2 * flicker);
        emissive[vertexCount] = 1.0; // fully emissive — stays bright at night
      } else if (blockType === BlockTypes.CORRUPTED_STONE) {
        // Dark purple with vein variation — keeps AO/height darkening
        const vein = blockHash(x + i, y, z + i) * 0.08;
        const finalMod = lightMod * aoMod * heightMod;
        colors[idx] = Math.min(1, srgbToLinear(0.12 + vein) * finalMod);
        colors[idx + 1] = Math.min(1, srgbToLinear(0.05) * finalMod);
        colors[idx + 2] = Math.min(1, srgbToLinear(0.15 + vein) * finalMod);
      } else {
        const color = vertexBaseColor(blockType, face, v[1] === 1, wx, y, wz, wx + fx, y + fy, wz + fz, vertexColor);
        const finalMod = lightMod * aoMod * heightMod * noiseMod;
        let r = color[0] * finalMod;
        let g = color[1] * finalMod;
        let b = color[2] * finalMod;
        // Blend warm campfire glow onto nearby blocks
        if (campGlow > 0) {
          r = r + campGlow * 0.6;
          g = g + campGlow * 0.3;
          b = b + campGlow * 0.05;
          emissive[vertexCount] = campGlow * 0.7; // partial emissive for warm glow at night
        }
        colors[idx] = Math.min(1, r);
        colors[idx + 1] = Math.min(1, g);
        colors[idx + 2] = Math.min(1, b);
      }

      vertexCount++;
    }

    // Counter-clockwise seen from outside, so the front face points along the
    // normal (the FACES vertex lists run clockwise)
    indices.push(
      startVertex, startVertex + 2, startVertex + 1,
      startVertex, startVertex + 3, startVertex + 2
    );
  }

  /**
   * Draw each piece of a shaped cell as its own box, a little smaller than its
   * space so a seam shows between pieces. Sides inside the cell are always
   * drawn (they are the seams); sides on the cell's edge are skipped only
   * against a full opaque block.
   */
  function addShapedCell(x, y, z, blockType, shape) {
    const boxes = shapePieceBoxes(shape);
    const kind = (shape >> 8) & 3;
    const axis = (shape >> 10) & 3;
    for (let b = 0; b < boxes.length; b++) {
      const box = boxes[b];
      // A plank half joins its other half in the next cell: no seam or end face there
      let joined = null;
      if (kind === SHAPE_PLANK) {
        const plus = (shape >> (12 + plankBarIndex(box, axis))) & 1;
        const d = [0, 0, 0];
        d[axis] = plus ? 1 : -1;
        const px = x + d[0], py = y + d[1], pz = z + d[2];
        const other = getShape(px, py, pz);
        if (getBlock(px, py, pz) === blockType && ((other >> 8) & 3) === SHAPE_PLANK &&
            ((other >> 10) & 3) === axis && (other & boxMaskOf(box)) === boxMaskOf(box)) {
          joined = { side: plus ? axis + 3 : axis };
        }
      }
      let inset = SEAM_ALL;
      if (joined) {
        inset = SEAM_ALL.slice();
        inset[joined.side] = 0;
      }
      for (let f = 0; f < FACE_NAMES.length; f++) {
        const face = FACE_NAMES[f];
        const side = FACE_SIDE[face];
        if (joined && side.axis === axis && (side.max ? axis + 3 : axis) === joined.side) continue;
        const onEdge = side.max ? box[side.axis + 3] === 2 : box[side.axis] === 0;
        if (onEdge) {
          const nx = x + side.d[0], ny = y + side.d[1], nz = z + side.d[2];
          const adjacent = getBlock(nx, ny, nz);
          if (!TransparentBlocks.has(adjacent) && getShape(nx, ny, nz) === 0) continue;
        }
        addFace(x, y, z, face, blockType, box, inset);
      }
    }
  }

  for (let y = 0; y < CHUNK_SIZE_Y; y++) {
    for (let z = 0; z < CHUNK_SIZE; z++) {
      for (let x = 0; x < CHUNK_SIZE; x++) {
        const blockType = blocks[x + (z << 4) + (y << 8)];
        if (blockType === BlockTypes.AIR) continue;

        const shape = shapes ? shapes[x + (z << 4) + (y << 8)] : 0;
        if (shape !== 0) {
          addShapedCell(x, y, z, blockType, shape);
          continue; // no grass tufts or pebbles on pieces
        }

        if (fullFaceVisible(blockType, x, y + 1, z)) addFace(x, y, z, 'top', blockType);
        if (fullFaceVisible(blockType, x, y - 1, z)) addFace(x, y, z, 'bottom', blockType);
        if (fullFaceVisible(blockType, x, y, z + 1)) addFace(x, y, z, 'north', blockType);
        if (fullFaceVisible(blockType, x, y, z - 1)) addFace(x, y, z, 'south', blockType);
        if (fullFaceVisible(blockType, x + 1, y, z)) addFace(x, y, z, 'east', blockType);
        if (fullFaceVisible(blockType, x - 1, y, z)) addFace(x, y, z, 'west', blockType);
        decorateBlock(decor, blockType, getBlock(x, y + 1, z), x, y, z, baseX + x, y, baseZ + z);
      }
    }
  }

  return {
    decor: decor.result(),
    positions: positions.slice(0, vertexCount * 3),
    normals: normals.slice(0, vertexCount * 3),
    colors: colors.slice(0, vertexCount * 3),
    emissive: emissive.slice(0, vertexCount),
    indices: new Uint32Array(indices),
    vertexCount,
    faceCount: indices.length / 6,
  };
}

// ============================================================================
// LOD MESH BUILDING
// ============================================================================

const LOD_MERGE_FACTORS = [1, 2, 4];

function getDominantBlock(blocks, startX, startY, startZ, size, chunkSize, chunkSizeY) {
  const counts = new Map();
  let maxCount = 0;
  let dominant = BlockTypes.AIR;
  let hasNonAir = false;

  for (let dx = 0; dx < size && startX + dx < chunkSize; dx++) {
    for (let dy = 0; dy < size && startY + dy < chunkSizeY; dy++) {
      for (let dz = 0; dz < size && startZ + dz < chunkSize; dz++) {
        const x = startX + dx;
        const y = startY + dy;
        const z = startZ + dz;
        const index = x + (z << 4) + (y << 8);
        const blockType = blocks[index];

        if (blockType !== BlockTypes.AIR) {
          hasNonAir = true;
          const count = (counts.get(blockType) || 0) + 1;
          counts.set(blockType, count);
          if (count > maxCount) {
            maxCount = count;
            dominant = blockType;
          }
        }
      }
    }
  }
  return hasNonAir ? dominant : BlockTypes.AIR;
}

function generateLODBlocks(sourceBlocks, lodLevel) {
  const mergeFactor = LOD_MERGE_FACTORS[lodLevel];
  const lodSize = Math.ceil(CHUNK_SIZE / mergeFactor);
  const lodSizeY = Math.ceil(CHUNK_SIZE_Y / mergeFactor);
  const lodBlocks = new Uint8Array(lodSize * lodSize * lodSizeY);

  for (let y = 0; y < lodSizeY; y++) {
    for (let z = 0; z < lodSize; z++) {
      for (let x = 0; x < lodSize; x++) {
        const sourceX = x * mergeFactor;
        const sourceY = y * mergeFactor;
        const sourceZ = z * mergeFactor;
        const dominant = getDominantBlock(sourceBlocks, sourceX, sourceY, sourceZ, mergeFactor, CHUNK_SIZE, CHUNK_SIZE_Y);
        const lodIndex = x + (z * lodSize) + (y * lodSize * lodSize);
        lodBlocks[lodIndex] = dominant;
      }
    }
  }
  return { lodBlocks, lodSize, lodSizeY };
}

function buildLODMesh(params) {
  const { blocks, lodLevel } = params;
  const { lodBlocks, lodSize, lodSizeY } = generateLODBlocks(blocks, lodLevel);
  const voxelScale = LOD_MERGE_FACTORS[lodLevel] * VOXEL_SIZE;
  // World block coordinates of LOD cell (x, z): same tints as full-detail chunks
  const merge = LOD_MERGE_FACTORS[lodLevel];
  const baseX = (params.chunkX || 0) * CHUNK_SIZE;
  const baseZ = (params.chunkZ || 0) * CHUNK_SIZE;
  const lodColor = [0, 0, 0];

  const maxVertices = 16000;
  const positions = new Float32Array(maxVertices * 3);
  const normals = new Float32Array(maxVertices * 3);
  const colors = new Float32Array(maxVertices * 3);
  const emissive = new Float32Array(maxVertices);
  const indices = [];
  let vertexCount = 0;

  function getBlock(x, y, z) {
    if (x < 0 || x >= lodSize || y < 0 || y >= lodSizeY || z < 0 || z >= lodSize) {
      return BlockTypes.AIR;
    }
    return lodBlocks[x + (z * lodSize) + (y * lodSize * lodSize)];
  }

  function shouldRenderFace(blockType, adjacentType) {
    if (blockType === BlockTypes.AIR) return false;
    if (TransparentBlocks.has(adjacentType)) {
      if (blockType === adjacentType) return false;
      return true;
    }
    return false;
  }

  function isSolidForAO(x, y, z) {
    const b = getBlock(x, y, z);
    return b !== BlockTypes.AIR && b !== BlockTypes.WATER && b !== BlockTypes.LEAVES && b !== BlockTypes.ICE && b !== BlockTypes.DEAD_LEAVES;
  }

  const AO_OFFSETS_LOD = {
    top: [
      [[-1,1,0],[0,1,-1],[-1,1,-1]],
      [[1,1,0],[0,1,-1],[1,1,-1]],
      [[1,1,0],[0,1,1],[1,1,1]],
      [[-1,1,0],[0,1,1],[-1,1,1]],
    ],
    bottom: [
      [[-1,-1,0],[0,-1,1],[-1,-1,1]],
      [[1,-1,0],[0,-1,1],[1,-1,1]],
      [[1,-1,0],[0,-1,-1],[1,-1,-1]],
      [[-1,-1,0],[0,-1,-1],[-1,-1,-1]],
    ],
    north: [
      [[-1,0,1],[0,-1,1],[-1,-1,1]],
      [[-1,0,1],[0,1,1],[-1,1,1]],
      [[1,0,1],[0,1,1],[1,1,1]],
      [[1,0,1],[0,-1,1],[1,-1,1]],
    ],
    south: [
      [[1,0,-1],[0,-1,-1],[1,-1,-1]],
      [[1,0,-1],[0,1,-1],[1,1,-1]],
      [[-1,0,-1],[0,1,-1],[-1,1,-1]],
      [[-1,0,-1],[0,-1,-1],[-1,-1,-1]],
    ],
    east: [
      [[1,0,1],[1,-1,0],[1,-1,1]],
      [[1,0,1],[1,1,0],[1,1,1]],
      [[1,0,-1],[1,1,0],[1,1,-1]],
      [[1,0,-1],[1,-1,0],[1,-1,-1]],
    ],
    west: [
      [[-1,0,-1],[-1,-1,0],[-1,-1,-1]],
      [[-1,0,-1],[-1,1,0],[-1,1,-1]],
      [[-1,0,1],[-1,1,0],[-1,1,1]],
      [[-1,0,1],[-1,-1,0],[-1,-1,1]],
    ],
  };

  const AO_BRIGHTNESS_LOD = [0.5, 0.65, 0.8, 1.0];

  function lodBlockHash(x, y, z) {
    let h = (x * 374761393 + y * 668265263 + z * 1274126177) | 0;
    h = ((h ^ (h >> 13)) * 1103515245) | 0;
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  function addFace(x, y, z, face, blockType) {
    if (vertexCount + 4 > maxVertices) return;
    const faceData = FACES[face];
    // Light baked per face, on top of the scene's sun and sky light
    let lightMod = 1.0;
    if (face === 'bottom') lightMod = FACE_LIGHT_BOTTOM;
    else if (face === 'north' || face === 'south') lightMod = FACE_LIGHT_NS;
    else if (face === 'east' || face === 'west') lightMod = FACE_LIGHT_EW;

    const heightMod = 0.88 + (y / lodSizeY) * 0.20;
    const noiseMod = 0.96 + lodBlockHash(x, y, z) * 0.08;

    const aoOffsets = AO_OFFSETS_LOD[face];
    const startVertex = vertexCount;
    for (let i = 0; i < 4; i++) {
      const v = faceData.vertices[i];
      const idx = vertexCount * 3;
      positions[idx] = (x + v[0]) * voxelScale;
      positions[idx + 1] = (y + v[1]) * voxelScale;
      positions[idx + 2] = (z + v[2]) * voxelScale;
      normals[idx] = faceData.normal[0];
      normals[idx + 1] = faceData.normal[1];
      normals[idx + 2] = faceData.normal[2];

      const offsets = aoOffsets[i];
      const s1 = isSolidForAO(x + offsets[0][0], y + offsets[0][1], z + offsets[0][2]);
      const s2 = isSolidForAO(x + offsets[1][0], y + offsets[1][1], z + offsets[1][2]);
      const cn = isSolidForAO(x + offsets[2][0], y + offsets[2][1], z + offsets[2][2]);
      const ao = (s1 && s2) ? 0 : 3 - (s1 + s2 + cn);

      if (blockType === BlockTypes.CAMPFIRE) {
        const flicker = 0.9 + lodBlockHash(x + i, y, z + i) * 0.2;
        colors[idx] = Math.min(1, 1.2 * flicker);
        colors[idx + 1] = Math.min(1, 0.7 * flicker);
        colors[idx + 2] = Math.min(1, 0.2 * flicker);
        emissive[vertexCount] = 1.0;
      } else if (blockType === BlockTypes.CORRUPTED_STONE) {
        const vein = lodBlockHash(x + i, y, z + i) * 0.08;
        const finalMod = lightMod * AO_BRIGHTNESS_LOD[ao] * heightMod;
        colors[idx] = Math.min(1, srgbToLinear(0.12 + vein) * finalMod);
        colors[idx + 1] = Math.min(1, srgbToLinear(0.05) * finalMod);
        colors[idx + 2] = Math.min(1, srgbToLinear(0.15 + vein) * finalMod);
      } else {
        const wx = baseX + x * merge;
        const wz = baseZ + z * merge;
        const color = vertexBaseColor(blockType, face, v[1] === 1, wx, y * merge, wz,
          wx + v[0] * merge, (y + v[1]) * merge, wz + v[2] * merge, lodColor);
        const finalMod = lightMod * AO_BRIGHTNESS_LOD[ao] * heightMod * noiseMod;
        colors[idx] = Math.min(1, color[0] * finalMod);
        colors[idx + 1] = Math.min(1, color[1] * finalMod);
        colors[idx + 2] = Math.min(1, color[2] * finalMod);
      }
      vertexCount++;
    }
    indices.push(startVertex, startVertex + 2, startVertex + 1, startVertex, startVertex + 3, startVertex + 2);
  }

  for (let y = 0; y < lodSizeY; y++) {
    for (let z = 0; z < lodSize; z++) {
      for (let x = 0; x < lodSize; x++) {
        const blockType = lodBlocks[x + (z * lodSize) + (y * lodSize * lodSize)];
        if (blockType === BlockTypes.AIR) continue;
        if (shouldRenderFace(blockType, getBlock(x, y + 1, z))) addFace(x, y, z, 'top', blockType);
        if (shouldRenderFace(blockType, getBlock(x, y - 1, z))) addFace(x, y, z, 'bottom', blockType);
        if (shouldRenderFace(blockType, getBlock(x, y, z + 1))) addFace(x, y, z, 'north', blockType);
        if (shouldRenderFace(blockType, getBlock(x, y, z - 1))) addFace(x, y, z, 'south', blockType);
        if (shouldRenderFace(blockType, getBlock(x + 1, y, z))) addFace(x, y, z, 'east', blockType);
        if (shouldRenderFace(blockType, getBlock(x - 1, y, z))) addFace(x, y, z, 'west', blockType);
      }
    }
  }

  return {
    positions: positions.slice(0, vertexCount * 3),
    normals: normals.slice(0, vertexCount * 3),
    colors: colors.slice(0, vertexCount * 3),
    emissive: emissive.slice(0, vertexCount),
    indices: new Uint32Array(indices),
    vertexCount,
    faceCount: indices.length / 6,
    lodLevel,
  };
}

// ============================================================================
// WORKER MESSAGE HANDLING
// ============================================================================

const activeTasks = new Map();

self.onmessage = function(event) {
  var data = event.data;
  var type = data.type;
  var requestId = data.requestId;

  switch (type) {
    case 'generateTerrain':
      handleGenerateTerrain(requestId, data);
      break;
    case 'buildMesh':
      handleBuildMesh(requestId, data);
      break;
    case 'buildLODMesh':
      handleBuildLODMesh(requestId, data);
      break;
    case 'generateAndBuildMesh':
      handleGenerateAndBuildMesh(requestId, data);
      break;
    case 'cancel':
      handleCancel(requestId);
      break;
    default:
      self.postMessage({ type: 'error', requestId: requestId, error: 'Unknown type: ' + type });
  }
};

/** Buffers of a mesh result (and its decorations) to transfer, not copy. */
function meshTransferables(mesh) {
  var list = [mesh.positions.buffer, mesh.normals.buffer, mesh.colors.buffer, mesh.indices.buffer];
  if (mesh.emissive) list.push(mesh.emissive.buffer);
  if (mesh.decor) {
    list.push(mesh.decor.positions.buffer, mesh.decor.normals.buffer, mesh.decor.colors.buffer, mesh.decor.indices.buffer);
  }
  return list;
}

function handleGenerateTerrain(requestId, data) {
  activeTasks.set(requestId, { cancelled: false });
  try {
    var result = generateTerrain(data);
    var task = activeTasks.get(requestId);
    if (task && task.cancelled) {
      activeTasks.delete(requestId);
      return;
    }
    self.postMessage(
      {
        type: 'terrainComplete',
        requestId: requestId,
        blocks: result.blocks,
        chunkX: result.chunkX,
        chunkZ: result.chunkZ
      },
      [result.blocks.buffer]
    );
  } catch (error) {
    self.postMessage({ type: 'error', requestId: requestId, error: error.message });
  } finally {
    activeTasks.delete(requestId);
  }
}

function handleBuildMesh(requestId, data) {
  activeTasks.set(requestId, { cancelled: false });
  try {
    var result = buildChunkMesh(data);
    var task = activeTasks.get(requestId);
    if (task && task.cancelled) {
      activeTasks.delete(requestId);
      return;
    }
    self.postMessage(
      {
        type: 'meshComplete',
        requestId: requestId,
        positions: result.positions,
        normals: result.normals,
        colors: result.colors,
        emissive: result.emissive,
        indices: result.indices,
        vertexCount: result.vertexCount,
        faceCount: result.faceCount,
        decor: result.decor
      },
      meshTransferables(result)
    );
  } catch (error) {
    self.postMessage({ type: 'error', requestId: requestId, error: error.message });
  } finally {
    activeTasks.delete(requestId);
  }
}

function handleBuildLODMesh(requestId, data) {
  activeTasks.set(requestId, { cancelled: false });
  try {
    var result = buildLODMesh(data);
    var task = activeTasks.get(requestId);
    if (task && task.cancelled) {
      activeTasks.delete(requestId);
      return;
    }
    self.postMessage(
      {
        type: 'lodMeshComplete',
        requestId: requestId,
        positions: result.positions,
        normals: result.normals,
        colors: result.colors,
        emissive: result.emissive,
        indices: result.indices,
        vertexCount: result.vertexCount,
        faceCount: result.faceCount,
        lodLevel: result.lodLevel
      },
      meshTransferables(result)
    );
  } catch (error) {
    self.postMessage({ type: 'error', requestId: requestId, error: error.message });
  } finally {
    activeTasks.delete(requestId);
  }
}

function handleGenerateAndBuildMesh(requestId, data) {
  activeTasks.set(requestId, { cancelled: false });
  try {
    var terrain = generateTerrain(data);
    var task = activeTasks.get(requestId);
    if (task && task.cancelled) {
      activeTasks.delete(requestId);
      return;
    }
    var mesh = buildChunkMesh({
      blocks: terrain.blocks,
      neighborNorth: data.neighborNorth || null,
      neighborSouth: data.neighborSouth || null,
      neighborEast: data.neighborEast || null,
      neighborWest: data.neighborWest || null,
      chunkX: terrain.chunkX,
      chunkZ: terrain.chunkZ
    });
    task = activeTasks.get(requestId);
    if (task && task.cancelled) {
      activeTasks.delete(requestId);
      return;
    }
    self.postMessage(
      {
        type: 'generateAndMeshComplete',
        requestId: requestId,
        chunkX: terrain.chunkX,
        chunkZ: terrain.chunkZ,
        blocks: terrain.blocks,
        positions: mesh.positions,
        normals: mesh.normals,
        colors: mesh.colors,
        emissive: mesh.emissive,
        indices: mesh.indices,
        vertexCount: mesh.vertexCount,
        faceCount: mesh.faceCount,
        decor: mesh.decor
      },
      [terrain.blocks.buffer].concat(meshTransferables(mesh))
    );
  } catch (error) {
    self.postMessage({ type: 'error', requestId: requestId, error: error.message });
  } finally {
    activeTasks.delete(requestId);
  }
}

function handleCancel(requestId) {
  const task = activeTasks.get(requestId);
  if (task) task.cancelled = true;
}

// Let main thread know worker is ready
self.postMessage({ type: 'ready' });
