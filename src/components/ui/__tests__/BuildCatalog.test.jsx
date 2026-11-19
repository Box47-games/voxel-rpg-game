import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import { PLACEABLE_BLOCKS } from '../../../data/blockDrops';
import BuildCatalog from '../BuildCatalog';
import BlockHotbar from '../BlockHotbar';

vi.mock('../../../utils/deviceDetection', () => ({ isTouchDevice: () => false }));

const press = (key, code) => act(() => { fireEvent.keyDown(window, { key, code }); });
const s = () => useGameStore.getState();

describe('BuildCatalog (B)', () => {
  beforeEach(() => {
    s().reset();
    useGameStore.setState({ inventory: { ...s().inventory, materials: { ...s().inventory.materials, stone: 5, clay: 3, wood: 100 } } });
  });

  test('B toggles it, opening on the Blocks tab; Esc backs out', () => {
    render(<BuildCatalog />);
    press('b', 'KeyB');
    expect(screen.getByRole('dialog', { name: 'Build catalog' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Blocks/ })).toHaveAttribute('aria-selected', 'true');
    press('b', 'KeyB');
    expect(screen.queryByRole('dialog')).toBeNull();
    press('b', 'KeyB');
    act(() => { expect(s().backOut()).toBe(true); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('Blocks tab lists every placeable block; picking one puts it in hand and closes', () => {
    render(<BuildCatalog />);
    act(() => s().openCatalog('blocks'));
    const tiles = screen.getAllByRole('button', { pressed: false });
    expect(tiles.length).toBe(PLACEABLE_BLOCKS.length);
    const clay = screen.getByText('Clay').closest('button');
    expect(within(clay).getByText('3')).toBeInTheDocument(); // 3 clay → 3 placeable
    fireEvent.click(clay);
    expect(s().selectedBlockType).toBe(BlockTypes.CLAY);
    expect(s().activeBuildingCatalog).toBe(false);
  });

  test('a block picked off the bar gets its own hotbar slot', () => {
    useGameStore.setState({ gameState: 'playing' });
    render(<BlockHotbar />);
    expect(screen.queryByTitle(/^Clay/)).toBeNull();
    act(() => s().pickBlock(BlockTypes.CLAY));
    expect(screen.getByTitle(/^Clay \(from Build\)/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('picking a block that a slot already holds holds that slot', () => {
    useGameStore.setState({ gameState: 'playing' });
    act(() => s().pickBlock(BlockTypes.STONE));
    expect(s().heldSlot).toBe(1);
    expect(s().selectedBlockType).toBe(BlockTypes.STONE);
  });

  test('number keys switch tabs while open without changing the held block', () => {
    useGameStore.setState({ gameState: 'playing' });
    render(<><BuildCatalog /><BlockHotbar /></>);
    act(() => s().openCatalog('blocks'));
    press('2');
    expect(screen.getByRole('tab', { name: /Buildings/ })).toHaveAttribute('aria-selected', 'true');
    expect(s().selectedBlockType).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Place' })[0]);
    expect(s().placingBuildingId).toBeTruthy();
    expect(s().activeBuildingCatalog).toBe(false);
  });

  test('Buildings tab: locked buildings say how to unlock instead of offering Place', () => {
    vi.useFakeTimers();
    render(<BuildCatalog />);
    act(() => s().openCatalog('buildings'));
    // Stone House and Blacksmith
    expect(screen.getAllByText('Have 3 settlers', { exact: false })).toHaveLength(2);
    expect(screen.getAllByText('(0/3 settlers)', { exact: false })).toHaveLength(2);
    expect(screen.getByText('Close a rift', { exact: false })).toBeInTheDocument();
    // Open from the start: Shelter and Farm Plot; Storage Shed needs a campfire
    expect(screen.getAllByRole('button', { name: /^Place/ })).toHaveLength(2);
    act(() => useGameStore.setState({ settlement: { ...s().settlement, settlementCenter: [0, 0, 0] } }));
    act(() => { vi.advanceTimersByTime(1100); });
    expect(screen.getAllByRole('button', { name: /^Place/ })).toHaveLength(3);
    vi.useRealTimers();
  });

  test('it opens over plan mode; the tab is remembered', () => {
    act(() => s().enterMode('plan'));
    act(() => s().openCatalog('buildings'));
    expect([s().planMode, s().activeBuildingCatalog]).toEqual([true, true]);
    act(() => s().closePanels());
    act(() => s().togglePanel('buildings'));
    expect(s().catalogTab).toBe('buildings');
  });
});
