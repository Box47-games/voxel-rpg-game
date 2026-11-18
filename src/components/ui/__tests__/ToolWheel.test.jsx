import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import ToolWheel from '../ToolWheel';

const s = () => useGameStore.getState();

describe('touch ToolWheel', () => {
  beforeEach(() => s().reset());

  test('opens as the "tools" panel and Esc (back out) closes it', () => {
    render(<ToolWheel />);
    expect(screen.queryByRole('dialog')).toBeNull();
    act(() => s().togglePanel('tools'));
    expect(screen.getByRole('dialog', { name: 'Tools' })).toBeInTheDocument();
    act(() => { expect(s().backOut()).toBe(true); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test.each([
    ['Bag', (st) => st.openPanel === 'inventory'],
    ['Craft', (st) => st.openPanel === 'crafting'],
    ['Build', (st) => st.activeBuildingCatalog],
    ['Plan', (st) => st.planMode && st.openPanel === null],
    ['Settlement', (st) => st.settlementDashboardOpen],
  ])('%s opens its screen and closes the wheel', (label, check) => {
    render(<ToolWheel />);
    act(() => s().togglePanel('tools'));
    fireEvent.click(screen.getByRole('button', { name: label }));
    expect(check(s())).toBe(true);
    expect(s().openPanel === 'tools').toBe(false);
  });

  test('the hotbar slots pick what is in hand; the hand clears it', () => {
    render(<ToolWheel />);
    act(() => s().togglePanel('tools'));
    // A new game's slots: wood, stone, dirt, empty
    fireEvent.click(screen.getByRole('button', { name: /^Stone block/ }));
    expect(s().heldSlot).toBe(1);
    expect(s().selectedBlockType).toBe(BlockTypes.STONE);
    expect(s().openPanel).toBeNull();
    act(() => s().togglePanel('tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Empty hand' }));
    expect(s().selectedBlockType).toBeNull();
    expect(s().heldSlot).toBeNull();
  });

  test('an empty slot opens the Bag to fill it', () => {
    render(<ToolWheel />);
    act(() => s().togglePanel('tools'));
    fireEvent.click(screen.getByRole('button', { name: 'Slot 4: empty' }));
    expect(s().openPanel).toBe('inventory');
  });
});
