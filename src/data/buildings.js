/**
 * buildings.js — Building type definitions for the construction system (Phase 2.4).
 *
 * Each building is defined by a layer-based voxel blueprint:
 *   - Layers are bottom-to-top (Y axis)
 *   - Each layer string: rows separated by '|', chars = columns (X axis)
 *   - Block char mapping: W=WOOD, S=STONE, I=IRON_ORE, K=COAL_ORE, .=AIR
 *   - Piece chars (block pieces, see systems/chunks/cellShape.js):
 *     Floors and roofs, filling the lower half of the cell:
 *       s = a stone slab
 *       = = wood planks running along X (two bars per cell)
 *       : = wood planks running along Z
 *     Walls, filling the outer half of the cell (the side facing out of the
 *     layer: front row → front half, back row → back half, then the left and
 *     right columns; corners count as front/back):
 *       v = a standing stone slab
 *       p = upright wood planks (two bars, running up)
 *       r = a fence rail: one plank bar along the wall, in the upper half
 *     A plank is 4 units long, so plank cells pair up along their axis
 *     (first two, next two, ...); an odd one out is half a plank.
 */

import { BlockTypes } from '../systems/chunks/blockTypes';
import { shapes as SHAPE, AXIS, SHAPE_KIND, encodeShape, pieceSlots, shapeMask } from '../systems/chunks/cellShape';
import {
  UPGRADE_SHELTER_TO_HOUSE_COST,
  UPGRADE_SHELTER_TO_HOUSE_SETTLERS,
  UPGRADE_HOUSE_TO_MANOR_COST,
  UPGRADE_HOUSE_TO_MANOR_SETTLERS,
} from './tuning';

const BLOCK_CHAR_MAP = {
  'W': BlockTypes.WOOD,
  'S': BlockTypes.STONE,
  'I': BlockTypes.IRON_ORE,
  'K': BlockTypes.COAL_ORE,
  '.': BlockTypes.AIR,
};

/**
 * Piece chars: block type, piece kind and where in the cell it sits.
 *   place 'floor' — lower half (slab thin along Y, planks along `axis`)
 *   place 'wall'  — outer half (slab thin across the wall, planks running up)
 *   place 'rail'  — one bar along the wall, outer half, upper half
 */
const PIECE_CHAR_MAP = {
  's': { blockType: BlockTypes.STONE, kind: SHAPE_KIND.SLAB, place: 'floor' },
  '=': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, place: 'floor', axis: AXIS.X },
  ':': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, place: 'floor', axis: AXIS.Z },
  'v': { blockType: BlockTypes.STONE, kind: SHAPE_KIND.SLAB, place: 'wall' },
  'p': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, place: 'wall' },
  'r': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, place: 'rail' },
};

const FULL_BOX = [0, 0, 0, 2, 2, 2];

export const BUILDINGS = [
  {
    id: 'wooden_shelter',
    name: 'Wooden Shelter',
    description: 'A plank cabin on log corner posts, with a plank floor and a pitched roof. Provides 1 housing slot.',
    size: { width: 5, height: 5, depth: 4 },
    cost: { wood: 52 },
    effects: { housing: 1, attractiveness: 5 },
    upgrade: { to: 'stone_house', cost: UPGRADE_SHELTER_TO_HOUSE_COST, settlers: UPGRADE_SHELTER_TO_HOUSE_SETTLERS },
    layers: [
      'WWWWW|W:::W|W:::W|WWWWW',   // Log sill, plank floor
      'Wp.pW|p...p|p...p|WpppW',   // Plank walls on log corner posts, front door
      'WpppW|p...p|.....|Wp.pW',   // Plank walls, side and back windows
      ':ppp:|:W.W:|:W.W:|:ppp:',   // Eaves, roof, plank gable ends
      '.:W:.|.:W:.|.:W:.|.:W:.',   // Roof and ridge
    ],
  },
  {
    id: 'stone_house',
    name: 'Stone House',
    description: 'Stone slab walls on log corner posts, a plank floor and a stepped stone roof. Provides 2 housing slots.',
    size: { width: 7, height: 6, depth: 6 },
    cost: { stone: 80, wood: 40 },
    effects: { housing: 2, attractiveness: 15 },
    upgrade: { to: 'manor', cost: UPGRADE_HOUSE_TO_MANOR_COST, settlers: UPGRADE_HOUSE_TO_MANOR_SETTLERS },
    layers: [
      'SSSSSSS|S:::::S|S:::::S|S:::::S|S:::::S|SSSSSSS',   // Foundation, plank floor
      'Wvv.vvW|v.....v|v.....v|v.....v|v.....v|WvvvvvW',   // Stone slab walls, front door
      'W.vvv.W|v.....v|.......|v.....v|v.....v|Wvv.vvW',   // Windows
      'WWWWWWW|W.....W|W.....W|W.....W|W.....W|WWWWWWW',   // Log band
      'sSSvSSs|sSS.SSs|sSS.SSs|sSS.SSs|sSS.SSs|sSSvSSs',   // Eaves, roof, slab gable ends
      '..sSs..|..sSs..|..sSs..|..sSs..|..sSs..|..sSs..',   // Ridge
    ],
  },
  {
    id: 'manor',
    name: 'Manor',
    description: 'A two-storey hall of stone slab walls with iron-framed windows and a tall stepped roof. Provides 4 housing slots. Built by upgrading a Stone House.',
    size: { width: 9, height: 8, depth: 8 },
    cost: { stone: 147.5, wood: 51, iron: 12 },
    effects: { housing: 4, attractiveness: 30 },
    upgradeOnly: true,
    layers: [
      'SSSSSSSSS|S:::::::S|S:::::::S|S:::::::S|S:::::::S|S:::::::S|S:::::::S|SSSSSSSSS',   // Foundation, plank floor
      'Svvv.vvvS|v.......v|v.......v|v.......v|v.......v|v.......v|v.......v|SvvvvvvvS',   // Slab walls on stone piers, front door
      'SI.IvI.IS|v.......v|I.......I|v.......v|v.......v|I.......I|v.......v|SI.IvI.IS',   // Iron-framed windows
      'WWWWWWWWW|W.......W|W.......W|W.......W|W.......W|W.......W|W.......W|WWWWWWWWW',   // Log band
      'Sv.vvv.vS|v.......v|v.......v|.........|.........|v.......v|v.......v|Sv.vvv.vS',   // Upper windows
      'sSSvvvSSs|sSS...SSs|sSS...SSs|sSS...SSs|sSS...SSs|sSS...SSs|sSS...SSs|sSSvvvSSs',   // Eaves, roof, slab gable ends
      '..sSSSs..|..sSSSs..|..sSSSs..|..sSSSs..|..sSSSs..|..sSSSs..|..sSSSs..|..sSSSs..',   // Roof
      '....s....|....s....|....s....|....s....|....s....|....s....|....s....|....s....',   // Ridge
    ],
  },
  {
    id: 'farm_plot',
    name: 'Farm Plot',
    description: 'A plot fenced with plank posts and rails. Farming zones must be next to one.',
    size: { width: 5, height: 2, depth: 5 },
    cost: { wood: 12 },
    effects: { housing: 0, attractiveness: 5, enablesFarming: true },
    layers: [
      'prprp|r...r|p...p|r...r|prprp',   // Plank posts and lower rails
      'prprp|r...r|p...p|r...r|prprp',   // Post tops and upper rails
    ],
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    description: 'A tower of stone slab walls with a lookout deck and a stone cap. Increases settlement visibility.',
    size: { width: 5, height: 9, depth: 5 },
    cost: { stone: 58, wood: 28.5, iron: 4 },
    effects: { housing: 0, attractiveness: 10 },
    layers: [
      '.sss.|sSSSs|sSSSs|sSSSs|.sss.',   // Plinth
      '.....|.S.S.|.v.v.|.SvS.|.....',   // Slab walls on stone corners, front door
      '.....|.SIS.|.I.I.|.SIS.|.....',   // Iron bands
      '.....|.S.S.|.v.v.|.SvS.|.....',   // Arrow slit
      '.....|.SvS.|.v.v.|.SvS.|.....',   // Tower top
      'WWWWW|W===W|W===W|W===W|WWWWW',   // Lookout deck
      'W.W.W|.....|W...W|.....|W.W.W',   // Railing posts
      'sssss|sSSSs|sSSSs|sSSSs|sssss',   // Cap
      '.....|.sss.|.sSs.|.sss.|.....',   // Cap top
    ],
  },
  {
    id: 'storage_shed',
    name: 'Storage Shed',
    description: 'A plank-walled shed with a tall double door and a plank roof. Keeps materials dry.',
    size: { width: 6, height: 6, depth: 6 },
    cost: { stone: 20, wood: 76 },
    effects: { housing: 0, attractiveness: 5 },
    layers: [
      'SSSSSS|S::::S|S::::S|S::::S|S::::S|SSSSSS',   // Foundation, plank floor
      'Wp..pW|p....p|p....p|p....p|p....p|WppppW',   // Plank walls, double door
      'Wp..pW|p....p|p....p|p....p|p....p|WppppW',   // Plank walls
      'WWWWWW|W....W|W....W|W....W|W....W|WWWWWW',   // Log band
      '======|WWWWWW|p....p|p....p|WWWWWW|======',   // Eaves, roof, plank gable ends
      '......|......|::::::|::::::|......|......',   // Ridge
    ],
  },
  {
    id: 'blacksmith',
    name: 'Blacksmith',
    description: 'An open-sided smithy: a coal forge with a chimney, an iron anvil and a lean-to roof on a post.',
    size: { width: 7, height: 6, depth: 6 },
    cost: { stone: 50, wood: 43.5, iron: 1, coal: 1 },
    effects: { housing: 0, attractiveness: 10 },
    layers: [
      'SsssssW|Sssssss|SssIsss|Sssssss|SSSssss|SSSSSSS',   // Stone floor, anvil, forge base, corner post
      'S.....W|v......|v......|v......|SKS....|SSSvvvv',   // Slab walls, coal bed, post
      'S.....W|v......|v......|v......|SSS....|SSSvvvv',   // Slab walls, forge hood, post
      ':::::::|:::::::|WWWWWWW|WWWWWWW|WWWWWWW|WSWWWWW',   // Lean-to roof, chimney
      '.......|.......|.......|.......|:::::::|:S:::::',   // Roof top, chimney
      '.......|.......|.......|.......|.......|.S.....',   // Chimney top
    ],
  },
];

/**
 * Get a building definition by its ID.
 */
export function getBuildingById(id) {
  return BUILDINGS.find(b => b.id === id) || null;
}

/**
 * Parse a building's layer strings into a flat array of cells to build.
 * Returns [{x, y, z, blockType, shape, box}] for all non-AIR cells, sorted
 * bottom-up then front-to-back (Z) then left-to-right (X).
 *   shape: 0 for a full block, else the cell shape (cellShape.js)
 *   box: the part of the cell it fills, in half-cell units (0..2)
 */
export function parseLayers(building) {
  const blocks = [];
  const grid = building.layers.map((layer) => layer.split('|'));
  const charAt = (x, y, z) => grid[y]?.[z]?.[x];
  const bounds = grid.map(layerBounds);

  for (let y = 0; y < grid.length; y++) {
    const rows = grid[y];
    for (let z = 0; z < rows.length; z++) {
      for (let x = 0; x < rows[z].length; x++) {
        const ch = rows[z][x];
        const piece = PIECE_CHAR_MAP[ch];
        if (piece) {
          const shape = pieceShape(ch, piece, x, y, z, charAt, bounds[y]);
          blocks.push({ x, y, z, blockType: piece.blockType, shape, box: maskBox(shapeMask(shape)) });
          continue;
        }
        const blockType = BLOCK_CHAR_MAP[ch];
        if (blockType !== undefined && blockType !== BlockTypes.AIR) {
          blocks.push({ x, y, z, blockType, shape: 0, box: FULL_BOX });
        }
      }
    }
  }

  // Sort: bottom-up (Y), then front-to-back (Z), then left-to-right (X)
  blocks.sort((a, b) => a.y - b.y || a.z - b.z || a.x - b.x);

  return blocks;
}

/** Extent of a layer's non-air cells: { x0, x1, z0, z1 }. */
function layerBounds(rows) {
  const b = { x0: Infinity, x1: -Infinity, z0: Infinity, z1: -Infinity };
  rows.forEach((row, z) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    b.x0 = Math.min(b.x0, x); b.x1 = Math.max(b.x1, x);
    b.z0 = Math.min(b.z0, z); b.z1 = Math.max(b.z1, z);
  }));
  return b;
}

/**
 * Which way a wall cell faces out of its layer: { axis, half } — the axis the
 * wall is thin along and the half (0 low side, 1 high side) that faces out.
 */
export function wallFacing(x, z, bounds) {
  if (z === bounds.z0) return { axis: AXIS.Z, half: 0 };
  if (z === bounds.z1) return { axis: AXIS.Z, half: 1 };
  if (x === bounds.x0) return { axis: AXIS.X, half: 0 };
  if (x === bounds.x1) return { axis: AXIS.X, half: 1 };
  return { axis: AXIS.Z, half: 0 }; // an inside wall: its front half
}

const coordOf = (index, axis) => [index & 1, (index >> 1) & 1, (index >> 2) & 1][axis];

/** Shape of a piece char's cell; planks pair with the next cell along their run. */
function pieceShape(ch, piece, x, y, z, charAt, bounds) {
  const out = piece.place === 'floor' ? null : wallFacing(x, z, bounds);
  if (piece.kind === SHAPE_KIND.SLAB) {
    return out ? SHAPE.slab(out.axis, [out.half]) : SHAPE.slab(AXIS.Y, [0]);
  }
  // Plank run axis and which bars of the cell are filled
  let axis;
  let keep;
  if (piece.place === 'floor') {
    axis = piece.axis;
    keep = (slot) => slot.box[1] === 0; // lower half
  } else if (piece.place === 'wall') {
    axis = AXIS.Y; // boards standing up
    keep = (slot) => slot.box[out.axis] === out.half;
  } else {
    axis = out.axis === AXIS.Z ? AXIS.X : AXIS.Z; // along the wall
    keep = (slot) => slot.box[out.axis] === out.half && slot.box[1] === 1;
  }
  const bars = pieceSlots(piece.kind, axis).filter(keep);
  const mask = bars.reduce((m, slot) => m | slot.mask, 0);
  // Position in the run of this char along the axis: even = partner ahead (+)
  const step = [0, 0, 0];
  step[axis] = 1;
  let i = 0;
  while (charAt(x - step[0] * (i + 1), y - step[1] * (i + 1), z - step[2] * (i + 1)) === ch) i++;
  const partners = i % 2 === 0 ? bars.reduce((bits, slot) => bits | (1 << slot.index), 0) : 0;
  return encodeShape(mask, piece.kind, axis, partners);
}

/** Bounding box of a fill mask, in half-cell units [x0, y0, z0, x1, y1, z1]. */
function maskBox(mask) {
  const box = [2, 2, 2, 0, 0, 0];
  for (let i = 0; i < 8; i++) {
    if (!((mask >> i) & 1)) continue;
    for (let a = 0; a < 3; a++) {
      const c = coordOf(i, a);
      box[a] = Math.min(box[a], c);
      box[a + 3] = Math.max(box[a + 3], c + 1);
    }
  }
  return box;
}

/**
 * Centre (relative to the building's corner) and size of the part of a cell a
 * parsed entry fills, in world units: for ghosts and previews.
 * @returns {{ center: number[], size: number[] }}
 */
export function cellBox(b, voxelSize = 2) {
  const box = b.box || FULL_BOX;
  const half = voxelSize / 2;
  return {
    center: [
      b.x * voxelSize + ((box[0] + box[3]) / 2) * half,
      b.y * voxelSize + ((box[1] + box[4]) / 2) * half,
      b.z * voxelSize + ((box[2] + box[5]) / 2) * half,
    ],
    size: [(box[3] - box[0]) * half, (box[4] - box[1]) * half, (box[5] - box[2]) * half],
  };
}

/** Units (of 8 per block) a parsed cell takes. */
export const cellUnits = (b) => {
  if (!b.shape) return 8;
  let n = 0;
  for (let m = shapeMask(b.shape); m; m >>= 1) n += m & 1;
  return n;
};
