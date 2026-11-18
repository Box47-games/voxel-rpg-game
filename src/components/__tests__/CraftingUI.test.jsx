import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../stores/useGameStore';
import CraftingUI from '../CraftingUI';

const s = () => useGameStore.getState();

describe('CraftingUI unlocks', () => {
  beforeEach(() => {
    s().reset();
    useGameStore.setState({ inventory: { ...s().inventory, materials: {} } });
  });

  test('level-locked recipes show the level and cannot be crafted', () => {
    render(<CraftingUI />);
    act(() => s().togglePanel('crafting'));
    expect(screen.getAllByText('Lv 3').length).toBeGreaterThan(0);
    expect(screen.getAllByTitle('Reach level 3').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Need materials').length).toBeGreaterThan(0);
    expect(screen.queryByText('Locked')).toBeNull();

    fireEvent.click(screen.getByText('Iron Pickaxe'));
    expect(screen.getByRole('button', { name: /Reach level 3/ })).toBeDisabled();
  });

  test('reaching the level lifts the lock; then only materials are missing', () => {
    useGameStore.setState({ player: { ...s().player, level: 3 } });
    render(<CraftingUI />);
    act(() => s().togglePanel('crafting'));
    fireEvent.click(screen.getByText('Iron Pickaxe'));
    expect(screen.queryByRole('button', { name: /Reach level/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Need materials' })).toBeDisabled();
  });
});
