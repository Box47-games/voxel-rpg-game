import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import PlanHUD from '../PlanHUD';

vi.mock('../../../utils/deviceDetection', () => ({ isTouchDevice: () => false }));

const s = () => useGameStore.getState();
const press = (key) => act(() => { fireEvent.keyDown(window, { key }); });

describe('PlanHUD', () => {
  beforeEach(() => {
    s().reset();
    useGameStore.setState({ inventory: { ...s().inventory, materials: { ...s().inventory.materials, wood: 100 } } });
  });

  test('hidden outside plan mode', () => {
    const { container } = render(<PlanHUD />);
    expect(container).toBeEmptyDOMElement();
  });

  test('zone tools and number keys pick the zone type', () => {
    render(<PlanHUD />);
    act(() => s().enterMode('plan'));
    expect(screen.getByRole('button', { name: /Mining/ })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: /Stockpile/ }));
    expect(s().zoneTypeToPlace).toBe('STOCKPILE');
    press('3');
    expect(s().zoneTypeToPlace).toBe('FARMING');
    press('4');
    expect(s().zoneTypeToPlace).toBe('__DELETE__');
  });

  test('a blueprint starts placement inside plan mode; clicking it again cancels', () => {
    render(<PlanHUD />);
    act(() => s().enterMode('plan'));
    fireEvent.click(screen.getByRole('button', { name: /Farm Plot/ }));
    expect([s().planMode, s().zoneMode, s().placingBuildingId]).toEqual([true, false, 'farm_plot']);
    expect(screen.getByText(/Farm Plot: click to place/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Farm Plot/ }));
    expect([s().placingBuildingId, s().zoneMode]).toEqual([null, true]);
  });

  test('blueprints you are short for can still be placed, and the hint says what is missing', () => {
    render(<PlanHUD />);
    act(() => s().enterMode('plan'));
    const house = screen.getByRole('button', { name: /Stone House/ });
    expect(house).toBeEnabled();
    expect(house).toHaveClass('plan-tool--short');
    fireEvent.click(house);
    expect(s().placingBuildingId).toBe('stone_house');
    expect(screen.getByText(/short .*settlers haul it from a stockpile/)).toBeInTheDocument();
  });

  test('overview shows the settlement once founded; Details opens the dashboard', () => {
    useGameStore.setState({ settlement: { ...s().settlement, settlementCenter: [0, 0, 0] } });
    render(<PlanHUD />);
    act(() => s().enterMode('plan'));
    expect(screen.getByRole('complementary', { name: 'Settlement overview' })).toHaveTextContent('Settlers');
    fireEvent.click(screen.getByRole('button', { name: /Details/ }));
    expect([s().settlementDashboardOpen, s().planMode]).toEqual([true, true]);
  });

  test('the close button leaves plan mode', () => {
    render(<PlanHUD />);
    act(() => s().enterMode('plan'));
    fireEvent.click(screen.getByRole('button', { name: 'Leave plan mode' }));
    expect(s().planMode).toBe(false);
  });
});
