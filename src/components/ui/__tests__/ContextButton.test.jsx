import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import ContextButton from '../ContextButton';

vi.mock('../../../utils/deviceDetection', () => ({ isTouchDevice: () => true }));
const melee = vi.hoisted(() => ({ calls: [] }));
vi.mock('../../../data/meleeAttack', () => ({
  MELEE_COOLDOWN: 0,
  performMeleeAttack: (store, pos, facing) => { melee.calls.push(facing); return { hit: false }; },
}));

const s = () => useGameStore.getState();
const enemyAt = (id, pos) => {
  useGameStore.setState({ enemies: [...s().enemies, { id, position: pos, alive: true }] });
  s()._enemyHandlers = new Map([...(s()._enemyHandlers || new Map()), [id, () => {}]]);
};

describe('touch attack button', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    melee.calls = [];
    s().reset();
    useGameStore.setState({ gameState: 'playing', enemies: [] });
    s()._enemyHandlers = new Map();
    s()._enemyPositions = new Map();
    useGameStore.setState({ player: { ...s().player, position: [0, 10, 0], facingAngle: 1 } });
  });
  afterEach(() => vi.useRealTimers());

  test('always a melee attack; with nothing near it swings the way you face', () => {
    render(<ContextButton />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Attack' }));
    expect(melee.calls).toEqual([1]);
  });

  test('swings at the nearest enemy in range, and keeps swinging while held', () => {
    enemyAt('e1', [0, 10, 5]); // straight ahead along +z: facing 0
    render(<ContextButton />);
    const btn = screen.getByRole('button', { name: 'Attack' });
    fireEvent.pointerDown(btn);
    expect(melee.calls[0]).toBeCloseTo(0);
    act(() => { vi.advanceTimersByTime(800); });
    expect(melee.calls.length).toBeGreaterThan(1);
    fireEvent.pointerUp(btn);
    const n = melee.calls.length;
    act(() => { vi.advanceTimersByTime(800); });
    expect(melee.calls.length).toBe(n);
  });

  test('never casts the spell (the wand button does that)', () => {
    useGameStore.setState({ activeSpellId: 'fireball', player: { ...s().player, mana: 100 } });
    const cast = vi.spyOn(s(), 'setSpellCooldown');
    render(<ContextButton />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Attack' }));
    expect(cast.mock.calls.every(([id]) => id === '__melee__')).toBe(true);
  });

  test('hidden while planning', () => {
    const { container } = render(<ContextButton />);
    act(() => s().enterMode('plan'));
    expect(container).toBeEmptyDOMElement();
  });
});
