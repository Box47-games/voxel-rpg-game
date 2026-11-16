import {
  isTool,
  getDurability,
  isBroken,
  usableTool,
  wearForBlock,
  wearTool,
  applyDeathWear,
  getRepairCost,
  canAffordRepair,
  repairedTool,
} from '../toolDurability';
import { CRAFTING_RECIPES } from '../../../data/craftingRecipes';
import MaterialCraftingSystem from '../../../modules/crafting/MaterialCraftingSystem';
import useGameStore from '../../../stores/useGameStore';
import {
  DURABILITY_STONE,
  DURABILITY_IRON,
  DURABILITY_STEEL,
  TOOL_TIER,
  TOOL_REPAIR_COST_FRACTION,
  DEATH_TOOL_DURABILITY_LOSS,
} from '../../../data/tuning';
import * as tuning from '../../../data/tuning';

const pick = (durability) => ({ ...CRAFTING_RECIPES.stonePickaxe, durability });
const store = () => useGameStore.getState();

describe('tool durability rules', () => {
  test('stone, iron and steel tools have durability; no wooden or diamond tier', () => {
    expect(CRAFTING_RECIPES.stonePickaxe.maxDurability).toBe(DURABILITY_STONE);
    expect(CRAFTING_RECIPES.stoneAxe.maxDurability).toBe(DURABILITY_STONE);
    expect(CRAFTING_RECIPES.ironPickaxe.maxDurability).toBe(DURABILITY_IRON);
    expect(CRAFTING_RECIPES.steelAxe.maxDurability).toBe(DURABILITY_STEEL);
    expect(TOOL_TIER).toEqual({ NONE: 0, STONE: 2, IRON: 3, STEEL: 4 });
    expect(Object.keys(tuning).filter((k) => /WOOD$|DIAMOND/.test(k) && /DURABILITY|HARVEST_SPEED/.test(k))).toEqual([]);
    expect(isTool(CRAFTING_RECIPES.ironSword)).toBe(false);
  });

  test('harder blocks cost more uses: ceil(hardness), at least 1', () => {
    expect(wearForBlock(0.2)).toBe(1); // leaves
    expect(wearForBlock(0.5)).toBe(1); // dirt
    expect(wearForBlock(1.5)).toBe(2); // stone
    expect(wearForBlock(3.0)).toBe(3); // ore
  });

  test('a tool saved before durability existed counts as new', () => {
    expect(getDurability({ ...CRAFTING_RECIPES.stonePickaxe })).toBe(DURABILITY_STONE);
  });

  test('wear stops at 0; a broken tool mines like bare hands', () => {
    const worn = wearTool(pick(2), 3);
    expect(worn.durability).toBe(0);
    expect(isBroken(worn)).toBe(true);
    expect(usableTool(worn)).toBeNull();
    expect(usableTool(pick(5))).not.toBeNull();
  });

  test('repair costs part of the recipe, scaled by wear, at least 1 each', () => {
    const recipe = CRAFTING_RECIPES.stonePickaxe.requirements; // wood 3, stone 5
    expect(getRepairCost(pick(DURABILITY_STONE))).toBeNull();
    const broken = getRepairCost(pick(0));
    for (const [m, n] of Object.entries(recipe)) {
      expect(broken[m]).toBe(Math.max(1, Math.ceil(n * TOOL_REPAIR_COST_FRACTION)));
    }
    const nearlyNew = getRepairCost(pick(DURABILITY_STONE - 1));
    expect(nearlyNew).toEqual({ wood: 1, stone: 1 });
    expect(canAffordRepair(pick(0), { wood: 99, stone: 99 })).toBe(true);
    expect(canAffordRepair(pick(0), { wood: 99 })).toBe(false);
    expect(repairedTool(pick(0)).durability).toBe(DURABILITY_STONE);
  });

  test('dying costs a quarter of full durability', () => {
    expect(applyDeathWear(pick(DURABILITY_STONE)).durability)
      .toBe(DURABILITY_STONE - Math.ceil(DURABILITY_STONE * DEATH_TOOL_DURABILITY_LOSS));
  });
});

describe('tools in the game store', () => {
  beforeEach(() => {
    store().resetGame?.();
    useGameStore.setState((s) => ({
      equipment: { ...s.equipment, weapon: pick(3) },
      inventory: { ...s.inventory, items: [pick(0)], materials: { wood: 10, stone: 10 } },
    }));
  });

  test('mining wears the tool in hand and reports when it breaks', () => {
    expect(store().wearEquippedTool(0.5)).toBe(false); // 3 → 2
    expect(store().equipment.weapon.durability).toBe(2);
    expect(store().wearEquippedTool(3.0)).toBe(true); // 2 → 0
    expect(store().equipment.weapon.durability).toBe(0);
    expect(store().wearEquippedTool(1)).toBe(false); // already broken: no change
  });

  test('repair the equipped tool or one in the bag, paying materials', () => {
    const cost = getRepairCost(store().equipment.weapon);
    expect(store().repairTool({ slot: 'weapon' })).toBe(true);
    expect(store().equipment.weapon.durability).toBe(DURABILITY_STONE);
    expect(store().inventory.materials.wood).toBe(10 - cost.wood);

    expect(store().repairTool({ index: 0 })).toBe(true);
    expect(store().inventory.items[0].durability).toBe(DURABILITY_STONE);
  });

  test('no repair without the materials', () => {
    useGameStore.setState((s) => ({ inventory: { ...s.inventory, materials: {} } }));
    expect(store().repairTool({ slot: 'weapon' })).toBe(false);
    expect(store().equipment.weapon.durability).toBe(3);
  });

  test('dying wears the tool in hand', () => {
    useGameStore.setState((s) => ({ equipment: { ...s.equipment, weapon: pick(DURABILITY_STONE) } }));
    store().respawnPlayer();
    expect(store().equipment.weapon.durability).toBeLessThan(DURABILITY_STONE);
  });

  test('crafted tools start at full durability', () => {
    useGameStore.setState((s) => ({ inventory: { ...s.inventory, items: [], materials: { wood: 10, stone: 10 } } }));
    const result = new MaterialCraftingSystem(useGameStore).craftItem('stonePickaxe');
    expect(result.success).toBe(true);
    expect(result.item.durability).toBe(DURABILITY_STONE);
  });
});
