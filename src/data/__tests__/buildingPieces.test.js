/**
 * Blueprint piece glyphs (s slab, = and : planks) and construction placing
 * them as shaped cells.
 */
import { parseLayers, getBuildingById, cellBox, cellUnits, BUILDINGS } from '../buildings';
import { BlockTypes } from '../../systems/chunks/blockTypes';
import {
  shapes as SHAPE, AXIS, SHAPE_KIND, shapeKind, shapeAxis, shapeMask, cellPieces, plankPartnerOffset,
} from '../../systems/chunks/cellShape';
import { placeNextBlock, getNextBlock } from '../../modules/settlement/buildingInfo';

const LOWER = 0b00110011;
const tiny = (layers) => ({ id: 't', layers, size: { width: 4, height: layers.length, depth: 4 } });

describe('blueprint piece glyphs', () => {
  test('s is a floor slab of stone filling the lower half', () => {
    const [b] = parseLayers(tiny(['s']));
    expect(b.blockType).toBe(BlockTypes.STONE);
    expect(b.shape).toBe(SHAPE.slab(AXIS.Y, [0]));
    expect(cellBox(b).size).toEqual([2, 1, 2]);
    expect(cellBox(b).center).toEqual([1, 0.5, 1]);
    expect(cellUnits(b)).toBe(4);
  });

  test('= is a plank floor along X; cells pair up into whole planks', () => {
    const cells = parseLayers(tiny(['====']));
    expect(cells).toHaveLength(4);
    for (const c of cells) {
      expect(c.blockType).toBe(BlockTypes.WOOD);
      expect(shapeKind(c.shape)).toBe(SHAPE_KIND.PLANK);
      expect(shapeAxis(c.shape)).toBe(AXIS.X);
      expect(shapeMask(c.shape)).toBe(LOWER);
      expect(cellPieces(c.shape)).toHaveLength(2); // two bars side by side
    }
    // 0 pairs with 1 (+), 1 with 0 (−), 2 with 3, 3 with 2
    const dirs = cells.map((c) => plankPartnerOffset(c.shape, cellPieces(c.shape)[0].index)[0]);
    expect(dirs).toEqual([1, -1, 1, -1]);
    // Both bars of a cell point the same way
    for (const c of cells) {
      const [a, b] = cellPieces(c.shape);
      expect(plankPartnerOffset(c.shape, a.index)).toEqual(plankPartnerOffset(c.shape, b.index));
    }
  });

  test(': is a plank floor along Z, paired along Z', () => {
    const cells = parseLayers(tiny(['.:|.:']));
    expect(cells.map((c) => [c.x, c.z])).toEqual([[1, 0], [1, 1]]);
    expect(cells.map((c) => shapeAxis(c.shape))).toEqual([AXIS.Z, AXIS.Z]);
    expect(cells.map((c) => plankPartnerOffset(c.shape, cellPieces(c.shape)[0].index)[2])).toEqual([1, -1]);
  });

  test('full blocks keep shape 0 and a full box', () => {
    const [b] = parseLayers(tiny(['W']));
    expect(b.shape).toBe(0);
    expect(cellBox(b).size).toEqual([2, 2, 2]);
    expect(cellUnits(b)).toBe(8);
  });

  test('the refreshed buildings use pieces', () => {
    const house = parseLayers(getBuildingById('stone_house'));
    // Slab eaves and ridge, standing slab walls, plank floor
    const slabs = house.filter((b) => b.shape && shapeKind(b.shape) === SHAPE_KIND.SLAB);
    expect(slabs.filter((b) => shapeAxis(b.shape) === AXIS.Y)).toHaveLength(24);
    expect(slabs.filter((b) => shapeAxis(b.shape) !== AXIS.Y).length).toBeGreaterThan(30);
    expect(house.filter((b) => b.shape && shapeKind(b.shape) === SHAPE_KIND.PLANK)).toHaveLength(20);
    // No full stone blocks in the walls: only corner posts are full
    expect(house.filter((b) => b.y === 1 && !b.shape).map((b) => b.blockType)).toEqual(Array(4).fill(BlockTypes.WOOD));
    // The farm plot is all planks
    expect(parseLayers(getBuildingById('farm_plot')).every((b) => b.shape && shapeKind(b.shape) === SHAPE_KIND.PLANK)).toBe(true);
  });

  test('every blueprint matches its size and costs exactly its volume', () => {
    const MAT = { [BlockTypes.WOOD]: 'wood', [BlockTypes.STONE]: 'stone', [BlockTypes.IRON_ORE]: 'iron', [BlockTypes.COAL_ORE]: 'coal' };
    for (const b of BUILDINGS) {
      expect(b.layers).toHaveLength(b.size.height);
      for (const layer of b.layers) {
        const rows = layer.split('|');
        expect(rows).toHaveLength(b.size.depth);
        for (const row of rows) expect(row).toHaveLength(b.size.width);
      }
      const volume = {};
      for (const c of parseLayers(b)) volume[MAT[c.blockType]] = (volume[MAT[c.blockType]] || 0) + cellUnits(c) / 8;
      expect(volume).toEqual(b.cost);
    }
  });

  test('the Blacksmith is open on its front and right side, with a coal forge and an iron anvil', () => {
    const smith = getBuildingById('blacksmith');
    const cells = parseLayers(smith);
    const at = (x, y, z) => cells.find((c) => c.x === x && c.y === y && c.z === z);
    const { width, depth } = smith.size;
    // Wall height (layers 1–2): no wall along the front row or the right column, bar the corner post
    for (const y of [1, 2]) {
      for (let x = 1; x < width - 1; x++) expect(at(x, y, 0)).toBeUndefined();
      for (let z = 1; z < depth - 1; z++) expect(at(width - 1, y, z)).toBeUndefined();
      for (let z = 0; z < depth; z++) expect(at(0, y, z)).toBeDefined(); // left wall
      for (let x = 0; x < width; x++) expect(at(x, y, depth - 1)).toBeDefined(); // back wall
    }
    expect(cells.some((c) => c.blockType === BlockTypes.COAL_ORE)).toBe(true);
    expect(cells.some((c) => c.blockType === BlockTypes.IRON_ORE)).toBe(true);
    // The chimney rises above the roof
    expect(at(1, smith.size.height - 1, depth - 1)?.blockType).toBe(BlockTypes.STONE);
  });
});

describe('wall pieces', () => {
  const box = (layers) => ({ id: 'w', layers, size: { width: 3, height: layers.length, depth: 3 } });
  const at = (cells, x, y, z) => cells.find((c) => c.x === x && c.y === y && c.z === z);

  test('v is a standing stone slab on the outer half of the wall', () => {
    const cells = parseLayers(box(['vvv|v.v|vvv']));
    expect(at(cells, 1, 0, 0).box).toEqual([0, 0, 0, 2, 2, 1]); // front: low Z half
    expect(at(cells, 1, 0, 2).box).toEqual([0, 0, 1, 2, 2, 2]); // back: high Z half
    expect(at(cells, 0, 0, 1).box).toEqual([0, 0, 0, 1, 2, 2]); // left: low X half
    expect(at(cells, 2, 0, 1).box).toEqual([1, 0, 0, 2, 2, 2]); // right: high X half
    for (const c of cells) {
      expect(shapeKind(c.shape)).toBe(SHAPE_KIND.SLAB);
      expect(cellUnits(c)).toBe(4);
    }
  });

  test('p is two upright boards on the outer half; stacked cells pair into whole planks', () => {
    const cells = parseLayers(box(['.p.', '.p.', '.p.']));
    expect(cells).toHaveLength(3);
    for (const c of cells) {
      expect(shapeAxis(c.shape)).toBe(AXIS.Y);
      expect(cellPieces(c.shape)).toHaveLength(2);
      expect(c.box).toEqual([0, 0, 0, 2, 2, 1]);
    }
    const dirs = cells.map((c) => plankPartnerOffset(c.shape, cellPieces(c.shape)[0].index)[1]);
    expect(dirs).toEqual([1, -1, 1]); // the third is half a plank, pointing up at nothing
  });

  test('r is one rail bar along the wall, outer and upper half', () => {
    const cells = parseLayers(box(['rrr|r.r|rrr']));
    const front = at(cells, 1, 0, 0);
    expect(shapeAxis(front.shape)).toBe(AXIS.X);
    expect(front.box).toEqual([0, 1, 0, 2, 2, 1]);
    const side = at(cells, 0, 0, 1);
    expect(shapeAxis(side.shape)).toBe(AXIS.Z);
    expect(side.box).toEqual([0, 1, 0, 1, 2, 2]);
    expect(cellUnits(front)).toBe(2);
  });

  test('facing follows the layer\'s own extent (a tower on a wider plinth)', () => {
    const cells = parseLayers({ id: 't', layers: ['sssss|sssss|sssss|sssss|sssss', '.....|.vvv.|.v.v.|.vvv.|.....'], size: { width: 5, height: 2, depth: 5 } });
    expect(at(cells, 1, 1, 2).box).toEqual([0, 0, 0, 1, 2, 2]); // the tower's left wall
  });
});

describe('construction places pieces', () => {
  test('placeNextBlock writes a shaped cell with setCell, blocks with setBlock', () => {
    const calls = [];
    const world = {
      getBlock: () => 0,
      setBlock: (...a) => calls.push(['block', ...a]),
      setCell: (...a) => calls.push(['cell', ...a]),
    };
    const house = getBuildingById('stone_house');
    const cells = parseLayers(house);
    const slabIndex = cells.findIndex((c) => c.shape && shapeKind(c.shape) === SHAPE_KIND.SLAB);
    const site = { buildingId: 'stone_house', position: [0, 10, 0], status: 'BUILDING', blocksPlaced: 0 };
    placeNextBlock(site, world);
    expect(calls[0][0]).toBe('block');
    placeNextBlock({ ...site, blocksPlaced: slabIndex }, world);
    const next = getNextBlock({ ...site, blocksPlaced: slabIndex });
    expect(calls[1]).toEqual(['cell', next.x, next.y, next.z, BlockTypes.STONE, cells[slabIndex].shape]);
  });

  test('a world without setCell still gets a block (old adapters)', () => {
    const calls = [];
    const world = { getBlock: () => 0, setBlock: (...a) => calls.push(a) };
    const cells = parseLayers(getBuildingById('watchtower'));
    const i = cells.findIndex((c) => c.shape);
    placeNextBlock({ buildingId: 'watchtower', position: [0, 0, 0], status: 'BUILDING', blocksPlaced: i }, world);
    expect(calls).toHaveLength(1);
  });
});
