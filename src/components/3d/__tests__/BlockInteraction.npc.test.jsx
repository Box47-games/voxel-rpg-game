/**
 * E key next to settlers: opens the NPC panel unless a stockpile is closer.
 */
import React from 'react';
import { render } from '@testing-library/react';
import '../testSetup';
import useGameStore from '../../../stores/useGameStore';
import BlockInteraction from '../BlockInteraction';

const npc = (id, x, z) => ({ id, fullName: id, position: [x, 2, z], state: 'IDLE', appearance: {} });

const stockpile = (centerX, centerZ) => ({
  id: 'zone_1',
  type: 'STOCKPILE',
  bounds: { minX: centerX - 2, minZ: centerZ - 2, maxX: centerX + 2, maxZ: centerZ + 2 },
  storage: { items: {}, capacity: 100, usedCapacity: 0 },
});

function setup({ npcs = [], zones = [] } = {}) {
  const s = useGameStore.getState();
  useGameStore.setState({
    gameState: 'playing',
    player: { ...s.player, position: [0, 2, 0] },
    settlement: { ...s.settlement, npcs },
    zones,
  });
  render(<BlockInteraction chunkManager={null} />);
  return () => useGameStore.getState().useBlock();
}

describe('BlockInteraction E key with settlers', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState().setRiftManager(null);
  });

  test('opens the panel for the nearest settler in range', () => {
    const pressE = setup({ npcs: [npc('far', 3.5, 0), npc('near', 1, 1)] });
    expect(pressE()).toBe(true);
    expect(useGameStore.getState().activeNPCId).toBe('near');
  });

  test('ignores settlers out of range', () => {
    const pressE = setup({ npcs: [npc('far', 10, 0)] });
    pressE();
    expect(useGameStore.getState().activeNPCId).toBeNull();
  });

  test('a closer stockpile wins over a settler working at it', () => {
    const pressE = setup({ npcs: [npc('hauler', 3, 0)], zones: [stockpile(1, 0)] });
    pressE();
    expect(useGameStore.getState().activeStockpileZoneId).toBe('zone_1');
    expect(useGameStore.getState().activeNPCId).toBeNull();
  });

  test('a closer settler wins over a stockpile in range', () => {
    const pressE = setup({ npcs: [npc('friend', 1, 0)], zones: [stockpile(5, 0)] });
    pressE();
    expect(useGameStore.getState().activeNPCId).toBe('friend');
    expect(useGameStore.getState().activeStockpileZoneId).toBeNull();
  });

  // Wooden Shelter is 5x4 voxels: its centre is position + 5 on x and + 4 on z
  const shelterCenteredAt = (x) => ({ id: 'home', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [x - 5, 0, -4] });

  test('a completed building close by opens its panel', () => {
    useGameStore.setState({ constructionSites: [shelterCenteredAt(4)] });
    setup()();
    expect(useGameStore.getState().activeConstructionSiteId).toBe('home');
  });

  test('a completed building farther away does not take the E press', () => {
    useGameStore.setState({ constructionSites: [shelterCenteredAt(7)] }); // within site range, beyond building range
    setup()();
    expect(useGameStore.getState().activeConstructionSiteId).toBeNull();
  });

  test('E closes an open NPC panel', () => {
    const pressE = setup({ npcs: [npc('near', 1, 0)] });
    useGameStore.getState().setActiveNPC('near');
    pressE();
    expect(useGameStore.getState().activeNPCId).toBeNull();
  });
});
