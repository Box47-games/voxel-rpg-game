import useGameStore, { selectHotbar } from '../useGameStore';
import { BlockTypes } from '../../systems/chunks/blockTypes';

const s = () => useGameStore.getState();

describe('hotbar slots', () => {
  beforeEach(() => s().reset());

  test('a new game starts with wood, stone and dirt', () => {
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', null]);
  });

  test('only blocks and pieces go in; items and food do not', () => {
    s().setHotbarSlot(3, 'stone_slab');
    s().setHotbarSlot(0, 'berry');
    s().setHotbarSlot(1, 'iron');
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', 'stone_slab']);
  });

  test('swapping slots keeps the held slot in hand', () => {
    s().holdSlot(0);
    s().swapHotbarSlots(0, 2);
    expect(selectHotbar(s())).toEqual(['dirt', 'stone', 'wood', null]);
    expect(s().heldSlot).toBe(2);
    expect(s().selectedBlockType).toBe(BlockTypes.WOOD);
  });

  test('changing the held slot changes what is in hand', () => {
    s().holdSlot(1);
    s().setHotbarSlot(1, 'sand');
    expect(s().selectedBlockType).toBe(BlockTypes.SAND);
    s().setHotbarSlot(1, null);
    expect(s().selectedBlockType).toBeNull();
  });

  test('older saves without a hotbar get the default', () => {
    const { hotbar, ...rest } = s().inventory; // eslint-disable-line no-unused-vars
    useGameStore.setState({ inventory: rest });
    expect(selectHotbar(s())).toEqual(['wood', 'stone', 'dirt', null]);
    s().setHotbarSlot(3, 'clay');
    expect(s().inventory.hotbar).toEqual(['wood', 'stone', 'dirt', 'clay']);
  });

  test('leaves are no longer placeable', async () => {
    const { getPlacementCost } = await import('../../data/blockDrops');
    expect(getPlacementCost(BlockTypes.LEAVES)).toBeNull();
  });
});
