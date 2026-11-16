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
    render(<BlockHotbar />);
    expect(screen.queryByTitle(/^Clay/)).toBeNull();
    act(() => s().pickBlock(BlockTypes.CLAY));
    expect(screen.getByTitle(/^Clay \(B\)/)).toHaveAttribute('aria-pressed', 'true');
  });

  test('number keys switch tabs while open without changing the held block', () => {
    render(<><BuildCatalog /><BlockHotbar /></>);
    act(() => s().openCatalog('blocks'));
    press('2');
    expect(screen.getByRole('tab', { name: /Buildings/ })).toHaveAttribute('aria-selected', 'true');
    expect(s().selectedBlockType).toBeNull();
    fireEvent.click(screen.getAllByRole('button', { name: 'Place' })[0]);
    expect(s().placingBuildingId).toBeTruthy();
    expect(s().activeBuildingCatalog).toBe(false);
  });

  test('opening it leaves zone mode; the tab is remembered', () => {
    act(() => s().enterMode('zone'));
    act(() => s().openCatalog('buildings'));
    expect(s().zoneMode).toBe(false);
    act(() => s().closePanels());
    act(() => s().togglePanel('buildings'));
    expect(s().catalogTab).toBe('buildings');
  });
});
