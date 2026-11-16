import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import SettlementDashboard from '../SettlementDashboard';

const npc = (id, name, extra = {}) => ({
  id, fullName: name, state: 'IDLE', position: [0, 2, 0], hunger: 80, rest: 80, social: 80,
  happiness: 50, unhappyDays: 0, skills: {}, appearance: {}, ...extra,
});

function seed() {
  const s = useGameStore.getState();
  useGameStore.setState({
    settlement: {
      ...s.settlement,
      settlementCenter: [0, 2, 0],
      npcs: [npc('n1', 'Bria', { happiness: 90, homeId: 'h1' }), npc('n2', 'Aldric', { happiness: 30 })],
    },
    zones: [{ id: 'sp', type: 'STOCKPILE', bounds: {}, storage: { items: { wood: 12, berry: 4 }, capacity: 40, usedCapacity: 16 } }],
    constructionSites: [{ id: 'h1', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [0, 0, 0] }],
  });
}

const pressKey = (key) => act(() => { fireEvent.keyDown(window, { key }); });
const names = () => screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);

describe('SettlementDashboard', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    seed();
  });

  test('N opens and closes it; Esc (the central back-out) closes it', () => {
    render(<SettlementDashboard />);
    expect(screen.queryByRole('dialog')).toBeNull();
    pressKey('n');
    expect(screen.getByRole('dialog', { name: 'Settlement dashboard' })).toBeInTheDocument();
    pressKey('N');
    expect(screen.queryByRole('dialog')).toBeNull();
    pressKey('n');
    act(() => { expect(useGameStore.getState().backOut()).toBe(true); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  test('population tab lists settlers, sortable by column', () => {
    render(<SettlementDashboard />);
    pressKey('n');
    expect(screen.getByText('2 / 1')).toBeInTheDocument(); // 2 settlers, 1 bed (pioneer cap applies to arrivals)
    expect(names()).toEqual(['Aldric', 'Bria']);
    fireEvent.click(screen.getByText(/^Happiness/, { selector: 'th' }));
    expect(names()).toEqual(['Aldric', 'Bria']); // ascending happiness: 30, 90
    fireEvent.click(screen.getByText(/^Happiness/, { selector: 'th' }));
    expect(names()).toEqual(['Bria', 'Aldric']);
    expect(screen.getByText('Homeless')).toBeInTheDocument();
  });

  test('clicking a settler opens their detail panel', () => {
    render(<SettlementDashboard />);
    pressKey('n');
    fireEvent.click(screen.getByText('Bria'));
    expect(useGameStore.getState().activeNPCId).toBe('n1');
    expect(useGameStore.getState().settlementDashboardOpen).toBe(false);
  });

  test('resources, buildings and alerts tabs', () => {
    render(<SettlementDashboard />);
    pressKey('n');
    fireEvent.click(screen.getByRole('tab', { name: /Resources/ }));
    expect(screen.getByText('16 / 40')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Buildings/ }));
    expect(screen.getByText('Wooden Shelter')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: /Alerts/ }));
    expect(screen.getAllByText(/1 settler is homeless/).length).toBeGreaterThan(0);
  });

  test('clicking outside the panel closes it', () => {
    render(<SettlementDashboard />);
    pressKey('n');
    fireEvent.click(screen.getByRole('dialog').parentElement);
    expect(useGameStore.getState().settlementDashboardOpen).toBe(false);
  });

  test('ignores N while typing in a text field', () => {
    render(<><input aria-label="chat" /><SettlementDashboard /></>);
    act(() => { fireEvent.keyDown(screen.getByLabelText('chat'), { key: 'n' }); });
    expect(useGameStore.getState().settlementDashboardOpen).toBe(false);
  });
});
