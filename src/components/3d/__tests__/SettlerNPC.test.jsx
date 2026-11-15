/**
 * SettlerNPC: a voxel villager dressed for their job, animated by state.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '../testSetup';
import { advanceFrames } from '@react-three/fiber';
import useGameStore from '../../../stores/useGameStore';
import SettlerNPC from '../SettlerNPC';
import { createHumanoidInstance } from '../characters/humanoidModel';
import { generateNPCIdentity } from '../../../data/npcIdentity';

vi.mock('../characters/humanoidModel', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, createHumanoidInstance: vi.fn(actual.createHumanoidInstance) };
});

function addSettler(overrides = {}) {
  const npc = {
    id: 'npc_t1', ...generateNPCIdentity(77), preferredJob: 'miner',
    position: [0, 10, 0], targetPosition: null, facingAngle: 0, state: 'IDLE', stateTimer: 0,
    hunger: 80, rest: 80, social: 80, happiness: 70, carryingItem: null, ...overrides,
  };
  const s = useGameStore.getState();
  useGameStore.setState({ gameState: 'playing', settlement: { ...s.settlement, npcs: [npc] } });
  return npc;
}

function renderSettler(overrides) {
  const npc = addSettler(overrides);
  createHumanoidInstance.mockClear();
  const utils = render(<SettlerNPC npcData={npc} />);
  return { ...utils, npc, rig: createHumanoidInstance.mock.results.at(-1).value };
}

describe('SettlerNPC', () => {
  beforeEach(() => useGameStore.getState().reset());

  test('renders a villager model sized and dressed as a settler', () => {
    const { rig, container } = renderSettler();
    expect(container.querySelector('primitive')).not.toBeNull();
    const [look, opts] = createHumanoidInstance.mock.calls.at(-1);
    expect(look.hat).toBe('miner');
    expect(opts.unit).toBeLessThan(0.1);
    expect(rig.mesh.isSkinnedMesh).toBe(true);
  });

  test('swings a pickaxe while mining on site', () => {
    const { rig } = renderSettler({ state: 'WORKING_MINE' });
    let lowest = 0;
    for (let i = 0; i < 40; i++) {
      act(() => advanceFrames(1));
      lowest = Math.min(lowest, rig.bones.armR.rotation.x);
    }
    expect(rig.bones.toolPick.scale.x).toBe(1);
    expect(rig.bones.toolHammer.scale.x).toBe(0);
    expect(lowest).toBeLessThan(-1.5);
  });

  test('carries a crate while hauling', () => {
    const { rig } = renderSettler({ state: 'WORKING_HAUL', carryingItem: { material: 'wood', amount: 1 } });
    act(() => advanceFrames(5));
    expect(rig.bones.carry.scale.x).toBe(1);
  });

  test('stays still while the game is paused', () => {
    const { rig } = renderSettler({ state: 'WORKING_MINE' });
    useGameStore.setState({ gameState: 'paused' });
    act(() => advanceFrames(20));
    expect(rig.bones.toolPick.scale.x).toBe(0); // never posed
  });

  test('frees the model when removed', () => {
    const { rig, unmount } = renderSettler();
    const dispose = vi.spyOn(rig, 'dispose');
    unmount();
    expect(dispose).toHaveBeenCalled();
  });
});
