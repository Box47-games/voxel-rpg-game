/**
 * Enemy visuals: the voxel model faces its target, swings when it attacks,
 * flashes when hit, glows with status effects and plays a death animation.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '../testSetup';
import useGameStoreMock from '../../../stores/useGameStore';
import { advanceFrames } from '@react-three/fiber';
import { createEnemyInstance } from '../enemies/enemyModels';

vi.mock('../../../stores/useGameStore', () => {
  const createState = () => ({
    gameState: 'playing',
    player: { position: [0, 0, 0], health: 100, maxHealth: 100 },
    rifts: [],
    dealDamageToPlayer: vi.fn(),
    addDamageNumber: vi.fn(),
    addParticleEffect: vi.fn(),
    addXPOrb: vi.fn(),
    addLootDrop: vi.fn(),
    removeRiftEnemy: vi.fn(),
    _enemyPositions: new Map(),
    _enemyHandlers: new Map(),
    _chunkManager: null,
  });
  let state = createState();
  const mockStore = vi.fn((selector) => (selector ? selector(state) : state));
  mockStore.getState = () => state;
  mockStore.__reset = () => { state = createState(); };
  return { default: mockStore };
});

vi.mock('../enemies/enemyModels', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createEnemyInstance: vi.fn(actual.createEnemyInstance) };
});

import Enemy from '../Enemy';

const monster = (type, overrides = {}) => ({
  id: `rift_${type}`, type, health: 50, damage: 5, speed: 2, xp: 10, color: '#888888', ...overrides,
});

/** Render a monster and return its rig. */
function renderMonster(type, position = [0, 0, 10], overrides) {
  createEnemyInstance.mockClear();
  const utils = render(<Enemy position={position} monsterData={monster(type, overrides)} />);
  const rig = createEnemyInstance.mock.results.at(-1).value;
  return { ...utils, rig };
}

describe('Enemy visuals', () => {
  beforeEach(() => {
    useGameStoreMock.__reset();
    vi.useFakeTimers();
  });
  afterEach(() => vi.useRealTimers());

  test.each(['slime', 'goblin', 'skeleton', 'shadow'])('%s builds its own voxel model', (type) => {
    const { rig, container } = renderMonster(type);
    expect(createEnemyInstance).toHaveBeenCalledWith(type, expect.any(Object));
    expect(container.querySelector('primitive')).not.toBeNull();
    expect(container.querySelector('[data-testid="rapier-cuboid-collider"]')).not.toBeNull();
    expect(() => act(() => advanceFrames(20))).not.toThrow();
    expect(rig.mesh.visible).toBe(true);
  });

  test('turns to face the player it is chasing', () => {
    // Player at the origin, goblin to its +X side: it should face -X
    const { rig } = renderMonster('goblin', [10, 0, 0]);
    act(() => advanceFrames(60));
    expect(Math.cos(rig.mesh.rotation.y - -Math.PI / 2)).toBeGreaterThan(0.95);
  });

  test('swings its weapon when it attacks', () => {
    const { rig } = renderMonster('goblin', [1, 0, 0]);
    let highest = 0;
    for (let i = 0; i < 20; i++) {
      act(() => advanceFrames(1));
      highest = Math.min(highest, rig.bones.armR.rotation.x);
    }
    expect(useGameStoreMock.getState().dealDamageToPlayer).toHaveBeenCalled();
    expect(highest).toBeLessThan(-2);
  });

  test('flashes when hit, then fades back', () => {
    const { rig } = renderMonster('skeleton', [0, 0, 30]);
    act(() => useGameStoreMock.getState()._enemyHandlers.get('rift_skeleton').takeDamage(5));
    act(() => advanceFrames(1));
    expect(rig.material.emissive.r).toBeGreaterThan(0.8);
    act(() => advanceFrames(30));
    expect(rig.material.emissive.r).toBe(0);
  });

  test('glows blue while frozen', () => {
    const { rig } = renderMonster('goblin', [0, 0, 30]);
    act(() => useGameStoreMock.getState()._enemyHandlers.get('rift_goblin')
      .applyStatusEffect({ type: 'freeze', duration: 5 }));
    act(() => advanceFrames(2));
    expect(rig.material.emissive.b).toBeGreaterThan(rig.material.emissive.r);
  });

  test('topples, fades and disappears when it dies', () => {
    const { rig } = renderMonster('skeleton', [0, 0, 30], { health: 10 });
    act(() => useGameStoreMock.getState()._enemyHandlers.get('rift_skeleton').takeDamage(100));
    act(() => advanceFrames(1)); // dies
    act(() => advanceFrames(30));
    expect(Math.abs(rig.mesh.rotation.z) + Math.abs(rig.mesh.rotation.x)).toBeGreaterThan(0.5);
    act(() => advanceFrames(60));
    expect(rig.material.opacity).toBeLessThan(0.5);
    expect(rig.material.transparent).toBe(true);
    act(() => advanceFrames(30));
    expect(rig.mesh.visible).toBe(false);
  });

  test('frees its material when removed', () => {
    const { rig, unmount } = renderMonster('slime');
    const dispose = vi.spyOn(rig.material, 'dispose');
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
