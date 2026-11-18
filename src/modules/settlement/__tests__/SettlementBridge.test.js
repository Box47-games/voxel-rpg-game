/**
 * SettlementBridge.test.js — Tests for the store↔module bridge.
 */

import SettlementBridge from '../SettlementBridge';

// Mock useGameStore
const mockStoreState = {
  gameState: 'playing',
  settlement: {
    npcs: [],
    attractiveness: 0,
    settlementCenter: null,
  },
  inventory: { materials: { meat: 5 } },
  worldTime: { elapsed: 100 },
  zones: [{ id: 'zone_a' }],
  constructionSites: [{ id: 'site_a' }],
  setSettlementCenter: vi.fn(),
  updateSettlementAttractiveness: vi.fn(),
  updateSettlementTimestamps: vi.fn(),
  addSettlementNPC: vi.fn(),
  removeMaterial: vi.fn(),
  addMaterial: vi.fn(),
  consumeFromStockpile: vi.fn(),
  updateZone: vi.fn(),
  npcDeliverToConstruction: vi.fn(),
  advanceConstruction: vi.fn(),
  addPickupText: vi.fn(),
  batchUpdateSettlementNPCs: vi.fn(),
  removeSettlementNPC: vi.fn(),
};

vi.mock('../../../stores/useGameStore', () => ({
  __esModule: true,
  default: {
    getState: () => mockStoreState,
  },
}));

describe('SettlementBridge', () => {
  let bridge;
  let mockModule;

  beforeEach(() => {
    vi.clearAllMocks();
    mockModule = {
      setChunkAdapter: vi.fn(),
      setHost: vi.fn(),
      tickSettlementCore: vi.fn(),
    };
    bridge = new SettlementBridge(mockModule);
  });

  describe('setChunkAdapter', () => {
    test('creates adapter and passes to module', () => {
      const mockChunkManager = {
        chunks: new Map([['0,0', { blocks: new Uint8Array(10) }]]),
        getBlock: vi.fn(),
      };
      bridge.setChunkAdapter(mockChunkManager);
      expect(mockModule.setChunkAdapter).toHaveBeenCalledTimes(1);
      const adapter = mockModule.setChunkAdapter.mock.calls[0][0];
      expect(adapter.iterateChunks).toBeDefined();
      expect(adapter.getBlock).toBeDefined();
      expect(adapter.getRawChunkManager).toBeDefined();
      expect(adapter.getRawChunkManager()).toBe(mockChunkManager);
    });

    test('adapter reads and writes blocks through the chunk manager', () => {
      const mockChunkManager = {
        chunks: new Map([['0,0', { blocks: new Uint8Array(10) }]]),
        getBlock: vi.fn().mockReturnValue(7),
        setBlock: vi.fn(),
      };
      bridge.setChunkAdapter(mockChunkManager);
      const adapter = mockModule.setChunkAdapter.mock.calls[0][0];

      expect(adapter.getBlock(1, 2, 3)).toBe(7);
      adapter.setBlock(1, 2, 3, 0);
      expect(mockChunkManager.setBlock).toHaveBeenCalledWith(1, 2, 3, 0);
      expect(Array.from(adapter.iterateChunks())).toHaveLength(1);
    });
  });

  describe('host port', () => {
    test('gives the module a host backed by the store', () => {
      expect(mockModule.setHost).toHaveBeenCalledTimes(1);
      const host = mockModule.setHost.mock.calls[0][0];

      expect(host.getZones()).toBe(mockStoreState.zones);
      expect(host.getConstructionSites()).toBe(mockStoreState.constructionSites);

      host.consumeFromStockpile('z', 'berry', 1);
      host.updateZone('z', { a: 1 });
      host.addMaterial('stone', 2);
      host.removeMaterial('meat', 1);
      host.npcDeliverToConstruction('s', 'wood', 4, 'z1');
      host.advanceConstruction('s');
      host.addPickupText('Building complete!', '#44ff44');

      expect(mockStoreState.consumeFromStockpile).toHaveBeenCalledWith('z', 'berry', 1);
      expect(mockStoreState.updateZone).toHaveBeenCalledWith('z', { a: 1 });
      expect(mockStoreState.addMaterial).toHaveBeenCalledWith('stone', 2);
      expect(mockStoreState.removeMaterial).toHaveBeenCalledWith('meat', 1);
      expect(mockStoreState.npcDeliverToConstruction).toHaveBeenCalledWith('s', 'wood', 4, 'z1');
      expect(mockStoreState.advanceConstruction).toHaveBeenCalledWith('s');
      expect(mockStoreState.addPickupText).toHaveBeenCalledWith('Building complete!', '#44ff44');
    });
  });

  describe('tick', () => {
    test('ticks the module against the store state and syncs the results', () => {
      mockModule.tickSettlementCore.mockReturnValue({ campfireCenter: [1, 2, 3] });
      bridge.tick(0.016);
      expect(mockModule.tickSettlementCore).toHaveBeenCalledWith(0.016, mockStoreState);
      expect(mockStoreState.setSettlementCenter).toHaveBeenCalledWith([1, 2, 3]);
    });

    test('does nothing when the module is not ready (null results)', () => {
      mockModule.tickSettlementCore.mockReturnValue(null);
      expect(() => bridge.tick(0.016)).not.toThrow();
      expect(mockStoreState.updateSettlementTimestamps).not.toHaveBeenCalled();
    });
  });

  describe('getGameState', () => {
    test('hands the module the store state itself (no per-frame copy)', () => {
      const state = bridge.getGameState();
      expect(state).toBe(mockStoreState);
      // Everything attractiveness and the work loop read must be on it
      expect(state.zones).toBeDefined();
      expect(state.constructionSites).toBeDefined();
      expect(state.worldTime.elapsed).toBe(100);
    });
  });

  describe('syncToStore', () => {
    test('handles null results gracefully', () => {
      bridge.syncToStore(null);
      expect(mockStoreState.setSettlementCenter).not.toHaveBeenCalled();
    });

    test('sets settlement center and returns early', () => {
      bridge.syncToStore({ campfireCenter: [10, 5, 20] });
      expect(mockStoreState.setSettlementCenter).toHaveBeenCalledWith([10, 5, 20]);
      // Should NOT proceed to other updates
      expect(mockStoreState.batchUpdateSettlementNPCs).not.toHaveBeenCalled();
    });

    test('updates attractiveness when attractivenessUpdated', () => {
      bridge.syncToStore({
        campfireCenter: null,
        attractivenessUpdated: true,
        attractiveness: 42,
        batchUpdates: {},
        removeIds: [],
        notifications: [],
        foodConsumptions: [],
        timestamps: {},
      });
      expect(mockStoreState.updateSettlementAttractiveness).toHaveBeenCalledWith(42);
      expect(mockStoreState.updateSettlementTimestamps).toHaveBeenCalledWith(
        expect.objectContaining({ lastAttractivenessCalc: expect.any(Number) })
      );
    });

    test('adds new NPC from immigration', () => {
      const newNPC = { id: 'npc_1', fullName: 'Test' };
      bridge.syncToStore({
        campfireCenter: null,
        newNPC,
        batchUpdates: {},
        removeIds: [],
        notifications: [],
        foodConsumptions: [],
        timestamps: {},
      });
      expect(mockStoreState.addSettlementNPC).toHaveBeenCalledWith(newNPC);
    });

    test('skips the NPC write when there are no updates', () => {
      bridge.syncToStore({ campfireCenter: null, batchUpdates: {}, removeIds: [], notifications: [] });
      expect(mockStoreState.batchUpdateSettlementNPCs).not.toHaveBeenCalled();
    });

    test('writes NPC updates in one batch, before removals', () => {
      const callOrder = [];
      mockStoreState.batchUpdateSettlementNPCs.mockImplementation(() => callOrder.push('batchUpdate'));
      mockStoreState.removeSettlementNPC.mockImplementation(() => callOrder.push('remove'));

      bridge.syncToStore({
        campfireCenter: null,
        batchUpdates: { npc_1: { hunger: 50 } },
        removeIds: ['npc_2'],
        notifications: [],
      });

      expect(mockStoreState.batchUpdateSettlementNPCs).toHaveBeenCalledWith({ npc_1: { hunger: 50 } });
      expect(callOrder).toEqual(['batchUpdate', 'remove']);
    });

    test('removes NPCs', () => {
      bridge.syncToStore({
        campfireCenter: null,
        batchUpdates: {},
        removeIds: ['npc_1', 'npc_2'],
        notifications: [],
        foodConsumptions: [],
        timestamps: {},
      });
      expect(mockStoreState.removeSettlementNPC).toHaveBeenCalledWith('npc_1');
      expect(mockStoreState.removeSettlementNPC).toHaveBeenCalledWith('npc_2');
    });

    test('dispatches notifications', () => {
      const origAddNotification = window.addNotification;
      window.addNotification = vi.fn();

      bridge.syncToStore({
        campfireCenter: null,
        batchUpdates: {},
        removeIds: [],
        notifications: [
          { type: 'success', title: 'New Settler!', message: 'Test joined!' },
        ],
        foodConsumptions: [],
        timestamps: {},
      });

      expect(window.addNotification).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'success', title: 'New Settler!' })
      );

      window.addNotification = origAddNotification;
    });

    test('stamps lastNeedsUpdate only on frames where the needs tick ran', () => {
      bridge.syncToStore({ campfireCenter: null, needsTicked: false });
      expect(mockStoreState.updateSettlementTimestamps).not.toHaveBeenCalled();

      bridge.syncToStore({ campfireCenter: null, needsTicked: true });
      expect(mockStoreState.updateSettlementTimestamps).toHaveBeenCalledWith(
        { lastNeedsUpdate: expect.any(Number) }
      );
    });

    test('stamps lastImmigrationCheck only when an NPC actually spawned', () => {
      bridge.syncToStore({ campfireCenter: null, newNPC: null });
      expect(mockStoreState.updateSettlementTimestamps).not.toHaveBeenCalled();

      bridge.syncToStore({ campfireCenter: null, newNPC: { id: 'npc_1' } });
      expect(mockStoreState.updateSettlementTimestamps).toHaveBeenCalledWith(
        { lastImmigrationCheck: expect.any(Number) }
      );
    });
  });
});
