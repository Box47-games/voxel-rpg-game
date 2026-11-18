/**
 * Blueprint piece glyphs (s slab, = and : planks) and construction placing
 * them as shaped cells.
 */
import { parseLayers, getBuildingById, cellBox, cellUnits } from '../buildings';
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
    expect(house.filter((b) => b.shape && shapeKind(b.shape) === SHAPE_KIND.SLAB)).toHaveLength(16);
    expect(house.filter((b) => b.shape && shapeKind(b.shape) === SHAPE_KIND.PLANK)).toHaveLength(4);
    expect(parseLayers(getBuildingById('storage_shed')).filter((b) => b.shape)).toHaveLength(16);
    expect(parseLayers(getBuildingById('watchtower')).filter((b) => b.shape)).toHaveLength(9);
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
