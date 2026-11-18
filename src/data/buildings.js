/**
 * buildings.js — Building type definitions for the construction system (Phase 2.4).
 *
 * Each building is defined by a layer-based voxel blueprint:
 *   - Layers are bottom-to-top (Y axis)
 *   - Each layer string: rows separated by '|', chars = columns (X axis)
 *   - Block char mapping: W=WOOD, S=STONE, I=IRON_ORE, .=AIR
 *   - Piece chars (block pieces, see systems/chunks/cellShape.js), each filling
 *     the lower half of its cell:
 *       s = a stone slab (floor or flat roof)
 *       = = wood planks running along X (a plank floor: two bars per cell)
 *       : = wood planks running along Z
 *     A plank is 4 units long, so plank cells pair up along their axis
 *     (first two, next two, ...); an odd one out is half a plank.
 */

import { BlockTypes } from '../systems/chunks/blockTypes';
import { shapes as SHAPE, AXIS, SHAPE_KIND, encodeShape, pieceSlots } from '../systems/chunks/cellShape';
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
  '.': BlockTypes.AIR,
};

/** Piece chars: block type, piece kind and axis. Pieces fill the cell's lower half. */
const PIECE_CHAR_MAP = {
  's': { blockType: BlockTypes.STONE, kind: SHAPE_KIND.SLAB, axis: AXIS.Y },
  '=': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, axis: AXIS.X },
  ':': { blockType: BlockTypes.WOOD, kind: SHAPE_KIND.PLANK, axis: AXIS.Z },
};

// Lower half of a cell (sub-cubes with sy = 0)
const LOWER_HALF = 0b00110011;
// The cell box a piece char fills, in half-cell units [x0, y0, z0, x1, y1, z1]
const LOWER_BOX = [0, 0, 0, 2, 1, 2];
const FULL_BOX = [0, 0, 0, 2, 2, 2];

export const BUILDINGS = [
  {
    id: 'wooden_shelter',
    name: 'Wooden Shelter',
    description: 'A simple wooden cabin. Provides 1 housing slot.',
    size: { width: 3, height: 3, depth: 3 },
    cost: { wood: 25 },
    effects: { housing: 1, attractiveness: 5 },
    upgrade: { to: 'stone_house', cost: UPGRADE_SHELTER_TO_HOUSE_COST, settlers: UPGRADE_SHELTER_TO_HOUSE_SETTLERS },
    layers: [
      'WWW|W.W|WWW',   // Layer 0 (floor)
      'W.W|...|W.W',   // Layer 1 (walls with opening)
      'WWW|WWW|WWW',   // Layer 2 (roof)
    ],
  },
  {
    id: 'stone_house',
    name: 'Stone House',
    description: 'A sturdy stone dwelling with a plank floor and a slab roof. Provides 2 housing slots.',
    size: { width: 4, height: 4, depth: 4 },
    cost: { stone: 31, wood: 11 },
    effects: { housing: 2, attractiveness: 15 },
    upgrade: { to: 'manor', cost: UPGRADE_HOUSE_TO_MANOR_COST, settlers: UPGRADE_HOUSE_TO_MANOR_SETTLERS },
    layers: [
      'SSSS|S==S|S==S|SSSS',   // Layer 0 (foundation, plank floor inside)
      'SWWS|W..W|W..W|SWWS',   // Layer 1 (walls)
      'SWWS|W..W|W..W|SWWS',   // Layer 2 (walls)
      'ssss|ssss|ssss|ssss',   // Layer 3 (slab roof)
    ],
  },
  {
    id: 'manor',
    name: 'Manor',
    description: 'A large stone hall with iron-framed windows. Provides 4 housing slots. Built by upgrading a Stone House.',
    size: { width: 5, height: 4, depth: 5 },
    cost: { stone: 120, wood: 20, iron: 20 },
    effects: { housing: 4, attractiveness: 30 },
    upgradeOnly: true,
    layers: [
      'SSSSS|SSSSS|SSSSS|SSSSS|SSSSS',   // Layer 0 (floor)
      'SW.WS|W...W|W...W|W...W|SWWWS',   // Layer 1 (walls, front doorway)
      'SWIWS|I...I|W...W|I...I|SWIWS',   // Layer 2 (walls with iron windows)
      'SSSSS|SSSSS|SSSSS|SSSSS|SSSSS',   // Layer 3 (roof)
    ],
  },
  {
    id: 'farm_plot',
    name: 'Farm Plot',
    description: 'A wooden marker for a farm. Farming zones must be next to one.',
    size: { width: 3, height: 1, depth: 3 },
    cost: { wood: 10 },
    effects: { housing: 0, attractiveness: 5, enablesFarming: true },
    layers: [
      'WWW|W.W|WWW',   // Layer 0 (border)
    ],
  },
  {
    id: 'watchtower',
    name: 'Watchtower',
    description: 'A tall stone lookout. Increases settlement visibility.',
    size: { width: 3, height: 6, depth: 3 },
    cost: { stone: 22, iron: 5 },
    effects: { housing: 0, attractiveness: 10 },
    layers: [
      'SSS|SSS|SSS',   // Layer 0 (base)
      'SSS|S.S|SSS',   // Layer 1
      'S.S|...|S.S',   // Layer 2
      'S.S|...|S.S',   // Layer 3
      'SIS|I.I|SIS',   // Layer 4 (iron accents)
      'sss|sss|sss',   // Layer 5 (slab roof)
    ],
  },
  {
    id: 'storage_shed',
    name: 'Storage Shed',
    description: 'A simple storage building with a plank roof. Keeps materials dry.',
    size: { width: 4, height: 3, depth: 4 },
    cost: { wood: 11, stone: 10 },
    effects: { housing: 0, attractiveness: 5 },
    layers: [
      'WWWW|W..W|W..W|WWWW',   // Layer 0 (floor)
      'WSSW|S..S|S..S|WSSW',   // Layer 1 (walls)
      '====|====|====|====',   // Layer 2 (plank roof)
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

  for (let y = 0; y < grid.length; y++) {
    const rows = grid[y];
    for (let z = 0; z < rows.length; z++) {
      for (let x = 0; x < rows[z].length; x++) {
        const ch = rows[z][x];
        const piece = PIECE_CHAR_MAP[ch];
        if (piece) {
          blocks.push({ x, y, z, blockType: piece.blockType, shape: pieceShape(ch, piece, x, y, z, charAt), box: LOWER_BOX });
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

/** Shape of a piece char's cell; planks pair with the next cell along their axis. */
function pieceShape(ch, piece, x, y, z, charAt) {
  if (piece.kind === SHAPE_KIND.SLAB) return SHAPE.slab(AXIS.Y, [0]);
  // Position in the run of this char along the axis: even = partner ahead (+)
  const step = piece.axis === AXIS.X ? [1, 0] : [0, 1];
  let i = 0;
  while (charAt(x - step[0] * (i + 1), y, z - step[1] * (i + 1)) === ch) i++;
  const plus = i % 2 === 0;
  // Two bars side by side across the bottom of the cell: each pairs the same way
  const lowerBars = pieceSlots(piece.kind, piece.axis).filter((slot) => (slot.mask & ~LOWER_HALF) === 0);
  const partners = plus ? lowerBars.reduce((bits, slot) => bits | (1 << slot.index), 0) : 0;
  return encodeShape(LOWER_HALF, piece.kind, piece.axis, partners);
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
export const cellUnits = (b) => (b.shape ? (b.box[4] - b.box[1]) * 4 : 8);
