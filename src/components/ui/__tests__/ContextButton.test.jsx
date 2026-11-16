import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import ContextButton, { getContextKind } from '../ContextButton';

vi.mock('../../../utils/deviceDetection', () => ({ isTouchDevice: () => true }));

const s = () => useGameStore.getState();
const enemyAt = (id, pos) => {
  useGameStore.setState({ enemies: [...s().enemies, { id, position: pos, alive: true }] });
  s()._enemyHandlers = new Map([...(s()._enemyHandlers || new Map()), [id, () => {}]]);
};

describe('touch ContextButton', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    s().reset();
    useGameStore.setState({ gameState: 'playing', enemies: [], touchAim: null });
    s()._enemyHandlers = new Map();
    s()._enemyPositions = new Map();
    s()._touchActions = { startMine: vi.fn(() => true), stopMine: vi.fn(), place: vi.fn(() => true), harvest: vi.fn(() => true) };
    useGameStore.setState({ player: { ...s().player, position: [0, 10, 0] } });
  });
  afterEach(() => vi.useRealTimers());

  test('picks the most urgent action: attack > use > place/mine', () => {
    expect(getContextKind(s())).toBe('none');
    useGameStore.setState({ touchAim: 'block' });
    expect(getContextKind(s())).toBe('mine');
    useGameStore.setState({ selectedBlockType: BlockTypes.DIRT });
    expect(getContextKind(s())).toBe('place');
    useGameStore.setState({ touchAim: 'use' });
    expect(getContextKind(s())).toBe('use');
    enemyAt('e1', [5, 10, 5]);
    expect(getContextKind(s())).toBe('attack');
  });

  test('enemies out of range or dead do not count', () => {
    enemyAt('far', [100, 10, 0]);
    useGameStore.setState({ enemies: [...s().enemies, { id: 'dead', position: [1, 10, 1], alive: false }] });
    expect(getContextKind(s())).toBe('none');
  });

  test('hold mines until released; the icon follows the aim', () => {
    render(<ContextButton />);
    act(() => { useGameStore.setState({ touchAim: 'block' }); vi.advanceTimersByTime(200); });
    const btn = screen.getByRole('button', { name: 'Mine' });
    fireEvent.pointerDown(btn);
    expect(s()._touchActions.startMine).toHaveBeenCalled();
    fireEvent.pointerUp(btn);
    expect(s()._touchActions.stopMine).toHaveBeenCalled();
  });

  test('with a block in hand a tap places it; harvesting uses the harvest action', () => {
    useGameStore.setState({ selectedBlockType: BlockTypes.STONE, touchAim: 'block' });
    render(<ContextButton />);
    act(() => { vi.advanceTimersByTime(200); });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Place' }));
    expect(s()._touchActions.place).toHaveBeenCalledTimes(1);
    fireEvent.pointerUp(screen.getByRole('button', { name: 'Place' }));
    act(() => { useGameStore.setState({ touchAim: 'use' }); vi.advanceTimersByTime(200); });
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Use' }));
    expect(s()._touchActions.harvest).toHaveBeenCalledTimes(1);
  });

  test('hidden while planning', () => {
    const { container } = render(<ContextButton />);
    act(() => s().enterMode('plan'));
    expect(container).toBeEmptyDOMElement();
  });
});
