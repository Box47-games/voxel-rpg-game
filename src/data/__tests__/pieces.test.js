import {
  blocksAvailable,
  canAffordByVolume,
  spendByVolume,
  payVolume,
  addVolume,
  volumeOf,
  yieldUnits,
  piecesFromMining,
  pieceTiers,
  PIECE_RECIPES,
  applyPieceRecipe,
  pieceRecipeTimes,
  materialName,
  formatBlocks,
} from '../pieces';
import { calculateDrops, payPlacement, countPlaceable } from '../blockDrops';
import { BlockTypes } from '../../systems/chunks/blockTypes';
import { TOOL_TIER } from '../tuning';

describe('pieces: volume', () => {
  test('blocks and pieces add up by volume', () => {
    expect(blocksAvailable({ stone: 1, stone_slab: 3 }, 'stone')).toBe(2.5);
    expect(blocksAvailable({ dirt_cube: 12 }, 'dirt')).toBe(1.5);
    expect(blocksAvailable({ iron: 4 }, 'iron')).toBe(4);
    expect(volumeOf('stone_slab', 2)).toBe(1);
    expect(volumeOf('dirt_cube', 8)).toBe(1);
    expect(volumeOf('stone', 3)).toBe(3);
  });

  test('a cost in blocks is met by any mix: a block, 2 slabs or 8 cubes', () => {
    expect(canAffordByVolume({ stone: 1 }, { stone: 1 })).toBe(true);
    expect(canAffordByVolume({ stone_slab: 2 }, { stone: 1 })).toBe(true);
    expect(canAffordByVolume({ dirt_cube: 8 }, { dirt: 1 })).toBe(true);
    expect(canAffordByVolume({ stone_slab: 1 }, { stone: 1 })).toBe(false);
  });

  test('paying takes pieces first, then blocks', () => {
    expect(spendByVolume({ stone: 2, stone_slab: 2 }, { stone: 1 })).toEqual({ stone: 2 });
    expect(spendByVolume({ stone: 2, stone_slab: 1 }, { stone: 1 })).toEqual({ stone: 1, stone_slab: 1 });
    expect(spendByVolume({ wood: 3, wood_plank: 1, iron: 2 }, { wood: 2, iron: 1 })).toEqual({ wood: 1, wood_plank: 1, iron: 1 });
    expect(spendByVolume({ stone_slab: 1 }, { stone: 1 })).toBeNull();
  });

  test('a block broken for less than a block gives change as pieces', () => {
    const m = { stone: 1 };
    expect(payVolume(m, 'stone', 0.5)).toBe(0.5);
    expect(m).toEqual({ stone: 0, stone_slab: 1 });
    const d = { dirt: 1 };
    expect(payVolume(d, 'dirt', 0.125)).toBe(0.125);
    expect(d).toEqual({ dirt: 0, dirt_cube: 7 });
  });

  test('pays only what is there', () => {
    const m = { stone_slab: 1 };
    expect(payVolume(m, 'stone', 2)).toBe(0.5);
    expect(m.stone_slab).toBe(0);
  });

  test('refunds come back as blocks plus pieces', () => {
    const m = {};
    addVolume(m, 'stone', 2.5);
    addVolume(m, 'dirt', 0.375);
    addVolume(m, 'iron', 2);
    expect(m).toEqual({ stone: 2, stone_slab: 1, dirt_cube: 3, iron: 2 });
  });
});

describe('pieces: mining yields', () => {
  test('the right tool keeps more of the block', () => {
    expect(yieldUnits('stone', TOOL_TIER.NONE)).toBe(4);
    expect(yieldUnits('stone', TOOL_TIER.STONE)).toBe(6);
    expect(yieldUnits('stone', TOOL_TIER.IRON)).toBe(8);
    expect(yieldUnits('dirt', TOOL_TIER.NONE)).toBe(8);
  });

  test('a remainder is a chance of one more piece', () => {
    expect(piecesFromMining('stone', TOOL_TIER.STONE, () => 0.4)).toBe(2);
    expect(piecesFromMining('stone', TOOL_TIER.STONE, () => 0.6)).toBe(1);
    expect(piecesFromMining('wood', TOOL_TIER.IRON, () => 0.9)).toBe(2);
    expect(piecesFromMining('dirt', TOOL_TIER.NONE, () => 0.9)).toBe(8);
  });

  test('pickaxes count for stone, axes for wood', () => {
    expect(pieceTiers({ id: 'ironPickaxe', stats: { toolTier: 3 } })).toEqual({ pickaxe: 3, axe: 0 });
    expect(pieceTiers({ id: 'steelAxe', stats: {} })).toEqual({ pickaxe: 0, axe: TOOL_TIER.STEEL });
    expect(pieceTiers(null)).toEqual({ pickaxe: 0, axe: 0 });
  });

  test('mined blocks drop pieces', () => {
    expect(calculateDrops(BlockTypes.STONE, 0, { pickaxe: TOOL_TIER.IRON, axe: 0 })).toEqual([{ material: 'stone_slab', amount: 2 }]);
    expect(calculateDrops(BlockTypes.WOOD, 0, { pickaxe: TOOL_TIER.IRON, axe: 0 })).toEqual([{ material: 'wood_plank', amount: 1 }]);
    expect(calculateDrops(BlockTypes.GRASS, 0)).toEqual([{ material: 'dirt_cube', amount: 8 }]);
    expect(calculateDrops(BlockTypes.SAND, 0)).toEqual([{ material: 'sand_cube', amount: 8 }]);
    // Ores are unchanged
    expect(calculateDrops(BlockTypes.IRON_ORE, TOOL_TIER.IRON)).toEqual([{ material: 'iron', amount: 1 }]);
  });
});

describe('pieces: crafting and placing', () => {
  const recipe = (id) => PIECE_RECIPES.find((r) => r.id === id);

  test('combine and split by exact shapes', () => {
    expect(applyPieceRecipe(recipe('combine_stone'), { stone_slab: 5 })).toEqual({ stone_slab: 3, stone: 1 });
    expect(pieceRecipeTimes(recipe('combine_dirt'), { dirt_cube: 17 })).toBe(2);
    expect(applyPieceRecipe(recipe('combine_dirt'), { dirt_cube: 17 }, 2)).toEqual({ dirt_cube: 1, dirt: 2 });
    expect(applyPieceRecipe(recipe('split_wood'), { wood: 1 })).toEqual({ wood: 0, wood_plank: 2 });
    expect(applyPieceRecipe(recipe('combine_stone'), { stone_slab: 1 })).toBeNull();
  });

  test('placing a block takes a real block; a campfire takes planks too', () => {
    expect(countPlaceable(BlockTypes.STONE, { stone_slab: 6 })).toBe(0);
    expect(countPlaceable(BlockTypes.STONE, { stone: 2, stone_slab: 6 })).toBe(2);
    expect(payPlacement(BlockTypes.STONE, { stone_slab: 2 })).toBeNull();
    expect(payPlacement(BlockTypes.STONE, { stone: 1 })).toEqual({ stone: 0 });
    expect(countPlaceable(BlockTypes.CAMPFIRE, { wood_plank: 4 })).toBe(1);
    expect(payPlacement(BlockTypes.CAMPFIRE, { wood_plank: 5 })).toEqual({ wood_plank: 1 });
  });

  test('names and amounts', () => {
    expect(materialName('stone_slab', 2)).toBe('Stone slabs');
    expect(materialName('wood', 1)).toBe('Wood block');
    expect(materialName('iron', 3)).toBe('Iron');
    expect(formatBlocks(2.5)).toBe('2½');
    expect(formatBlocks(0.125)).toBe('⅛');
    expect(formatBlocks(0)).toBe('0');
  });
});
