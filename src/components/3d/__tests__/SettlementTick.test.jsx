/**
 * SettlementTick end-to-end: the real component, the real store, the real
 * SettlementBridge and SettlementModule — only the chunk world is faked.
 */
import React from 'react';
import { render, act } from '@testing-library/react';
import '../testSetup';
import { advanceFrames } from '@react-three/fiber';
import SettlementTick from '../SettlementTick';
import useGameStore from '../../../stores/useGameStore';
import SettlementModule from '../../../modules/settlement/SettlementModule';
import { clearTasks } from '../../../systems/settlement/TaskAssignmentEngine';
import { scanMiningZone } from '../../../systems/settlement/MiningZoneScanner';
import { createZone } from '../../../data/zoneTypes';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import {
  makeFakeChunkManager,
  makeChunkBlocks,
} from '../../../modules/settlement/__tests__/helpers/fakeWorld';
import {
  SETTLEMENT_CAMPFIRE_SCAN_INTERVAL,
  ATTRACT_CAMPFIRE_SCORE,
  IMMIGRATION_CHECK_INTERVAL,
  NPC_EVALUATION_DURATION,
  NPC_MINE_DURATION,
  WORK_SCAN_INTERVAL,
  DAY_LENGTH_SECONDS,
} from '../../../data/tuning';

const CENTER = [5, 11, 7];
const FRAME = 0.5;

/** Advance the game by `seconds` of half-second frames. */
const run = (seconds) => act(() => advanceFrames(Math.ceil(seconds / FRAME), FRAME));

const store = () => useGameStore.getState();
const settlement = () => store().settlement;

function makeWorld() {
  return makeFakeChunkManager([
    { x: 0, z: 0, blocks: makeChunkBlocks([2, 5, 3]), lastModified: 1 }, // player-placed campfire
  ]);
}

describe('SettlementTick', () => {
  let chunkManager;
  let originalAddNotification;

  beforeEach(() => {
    clearTasks();
    act(() => {
      store().reset();
      // Morning shift, so the settler works (see modules/settlement/schedule.js)
      useGameStore.setState({
        gameState: 'playing',
        worldTime: { ...store().worldTime, elapsed: 0.4 * DAY_LENGTH_SECONDS, timeOfDay: 0.4 },
      });
    });
    chunkManager = makeWorld();
    originalAddNotification = window.addNotification;
    window.addNotification = vi.fn();
  });

  afterEach(() => {
    window.addNotification = originalAddNotification;
  });

  test('publishes the settlement module on mount and withdraws it on unmount', () => {
    expect(store()._settlementModule).toBeNull();

    const { unmount } = render(<SettlementTick chunkManager={chunkManager} />);
    expect(store()._settlementModule).toBeInstanceOf(SettlementModule);
    expect(store()._settlementModule.initialized).toBe(true);

    unmount();
    expect(store()._settlementModule).toBeNull();
  });

  test('does nothing until the chunk manager is ready, then starts', () => {
    const { rerender } = render(<SettlementTick chunkManager={null} />);
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL * 2);
    expect(settlement().settlementCenter).toBeNull();

    rerender(<SettlementTick chunkManager={chunkManager} />);
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);
    expect(settlement().settlementCenter).toEqual(CENTER);
  });

  test.each(['paused', 'intro', 'dead'])('the simulation stands still while gameState is "%s"', (gameState) => {
    render(<SettlementTick chunkManager={chunkManager} />);
    act(() => useGameStore.setState({ gameState }));

    run(IMMIGRATION_CHECK_INTERVAL * 2);
    expect(settlement()).toEqual(expect.objectContaining({ settlementCenter: null, npcs: [], attractiveness: 0 }));

    // ...and picks up where it left off (no time was banked while paused)
    act(() => useGameStore.setState({ gameState: 'playing' }));
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL - FRAME);
    expect(settlement().settlementCenter).toBeNull();
    run(FRAME);
    expect(settlement().settlementCenter).toEqual(CENTER);
  });

  test('campfire → attractiveness → immigrant → settler → miner', () => {
    render(<SettlementTick chunkManager={chunkManager} />);

    // Campfire found
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);
    expect(settlement().settlementCenter).toEqual(CENTER);

    // Attractiveness scored, then an immigrant sets out for the campfire
    run(IMMIGRATION_CHECK_INTERVAL * 2);
    expect(settlement().attractiveness).toBeGreaterThanOrEqual(ATTRACT_CAMPFIRE_SCORE);
    expect(settlement().lastAttractivenessCalc).toBeGreaterThan(0);
    expect(settlement().npcs).toHaveLength(1);
    const id = settlement().npcs[0].id;
    expect(settlement().npcs[0]).toMatchObject({ state: 'APPROACHING', targetPosition: CENTER });
    expect(settlement().lastImmigrationCheck).toBeGreaterThan(0);

    // SettlerNPC (not mounted here) reports arrival
    act(() => store().updateSettlementNPC(id, {
      state: 'EVALUATING', stateTimer: 0, targetPosition: null, arrivedAtSettlement: true,
      position: [101, 6, 102], personality: 'lazy', skills: { mining: 1.0, gathering: 0.3, building: 0.3 },
    }));

    // It likes the place and joins
    run(NPC_EVALUATION_DURATION + 2);
    expect(settlement().npcs[0].state).toBe('IDLE');
    expect(window.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', title: 'New Settler!' })
    );
    expect(settlement().lastNeedsUpdate).toBeGreaterThan(0);

    // The player designates a mining zone next to it
    chunkManager.place(101, 5, 101, BlockTypes.STONE);
    const zone = createZone({ type: 'MINING', minX: 100, minZ: 100, maxX: 102, maxZ: 102 });
    act(() => {
      store().addZone(zone);
      store().updateZone(zone.id, { miningTasks: scanMiningZone(zone.bounds, chunkManager) });
    });

    const stoneBefore = store().inventory.materials.stone || 0;
    run(WORK_SCAN_INTERVAL + NPC_MINE_DURATION + 4);

    expect(chunkManager.setBlock).toHaveBeenCalledWith(101, 5, 101, BlockTypes.AIR);
    expect(store().inventory.materials.stone).toBe(stoneBefore + 1);
    expect(store().zones[0].miningTasks).toEqual([
      expect.objectContaining({ wx: 101, wy: 5, wz: 101, status: 'done' }),
    ]);
    expect(settlement().npcs[0]).toMatchObject({ state: 'IDLE', currentTaskId: null });
  });

  test('a new game (store reset) starts the settlement over', () => {
    render(<SettlementTick chunkManager={chunkManager} />);
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL + IMMIGRATION_CHECK_INTERVAL * 2);
    expect(settlement().npcs).toHaveLength(1);

    act(() => {
      store().reset();
      useGameStore.setState({ gameState: 'playing' });
    });
    expect(settlement()).toMatchObject({ settlementCenter: null, npcs: [], attractiveness: 0 });
    expect(store()._settlementModule).toBeInstanceOf(SettlementModule); // engine survives a reset

    // The engine holds no settlement of its own: it rediscovers the campfire
    run(SETTLEMENT_CAMPFIRE_SCAN_INTERVAL);
    expect(settlement().settlementCenter).toEqual(CENTER);
    expect(settlement().npcs).toEqual([]);
  });

  test('a loaded settlement (state replaced in the store) is simulated as loaded', () => {
    render(<SettlementTick chunkManager={chunkManager} />);
    const loaded = {
      id: 'npc_saved', fullName: 'Saved Settler', personality: 'stoic',
      position: [20, 2, 20], targetPosition: null, facingAngle: 0,
      state: 'SOCIALIZING', stateTimer: 0, hunger: 60, rest: 60, social: 60, happiness: 50,
      unhappyDays: 0, dayCheckpoint: 0, skills: {},
    };
    act(() => useGameStore.setState({
      settlement: { ...settlement(), npcs: [loaded], settlementCenter: [40, 3, 40], attractiveness: 12 },
    }));

    run(4);

    expect(settlement().settlementCenter).toEqual([40, 3, 40]); // not rescanned
    expect(settlement().npcs).toHaveLength(1);
    expect(settlement().npcs[0].id).toBe('npc_saved');
    expect(settlement().npcs[0].hunger).toBeLessThan(60); // needs are ticking
  });
});
