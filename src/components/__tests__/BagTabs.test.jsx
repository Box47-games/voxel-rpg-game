import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../stores/useGameStore';
import RepairUI, { listTools } from '../RepairUI';
import BagTabs from '../ui/BagTabs';

const s = () => useGameStore.getState();
const pick = (durability) => ({
  id: `pick_${durability}`, name: 'Stone Pickaxe', type: 'tool', maxDurability: 65, durability,
  requirements: { wood: 3, stone: 5 },
});

describe('Bag: Inventory, Craft and Repair tabs', () => {
  beforeEach(() => s().reset());

  test('tabs switch the open panel in place', () => {
    act(() => s().togglePanel('inventory'));
    render(<BagTabs active="inventory" />);
    expect(screen.getByRole('tab', { name: /Inventory/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /Craft/ }));
    expect(s().openPanel).toBe('crafting');
    fireEvent.click(screen.getByRole('tab', { name: /Repair/ }));
    expect(s().openPanel).toBe('repair');
  });

  test('listTools: equipped and bagged tools, most worn first', () => {
    const list = listTools({ weapon: pick(60), armor: { name: 'Shirt' } }, [{ name: 'Rock' }, pick(10)]);
    expect(list.map((t) => [t.where, t.item.durability])).toEqual([['In bag', 10], ['Equipped', 60]]);
    expect(list[0].target).toEqual({ index: 1 });
  });

  test('Repair tab lists tools and repairs one', () => {
    useGameStore.setState({
      equipment: { ...s().equipment, weapon: pick(5) },
      inventory: { ...s().inventory, materials: { ...s().inventory.materials, wood: 10, stone: 10 } },
    });
    render(<RepairUI />);
    act(() => s().togglePanel('repair'));
    expect(screen.getByRole('dialog', { name: 'Repair' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Repair \(/ }));
    expect(s().equipment.weapon.durability).toBe(65);
    act(() => { expect(s().backOut()).toBe(true); });
    expect(screen.queryByRole('dialog', { name: 'Repair' })).toBeNull();
  });

  test('Repair tab with no tools explains where they come from', () => {
    render(<RepairUI />);
    act(() => s().togglePanel('repair'));
    expect(screen.getByText(/No tools yet/)).toBeInTheDocument();
  });
});
