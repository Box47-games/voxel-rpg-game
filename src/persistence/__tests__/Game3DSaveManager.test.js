/**
 * Game3DSaveManager — save/load round trips through the real store and a
 * synchronous ChunkManager (fake-indexeddb).
 */
import useGameStore from '../../stores/useGameStore';
import Game3DSaveManager, { validateSaveData } from '../Game3DSaveManager';
import { ChunkManager } from '../../systems/chunks/ChunkManager';
import { getStockpileCapacity } from '../../data/zoneTypes';
import { scanForTasks, findBestTask, claimTask } from '../../systems/settlement/TaskAssignmentEngine';
import { RiftManager, RiftState } from '../../systems/survival/RiftManager';
import { shapes as SHAPE, AXIS } from '../../systems/chunks/cellShape';

async function loadChunksAround(cm, x, z) {
  cm.updatePlayerPosition(x, z);
  for (let i = 0; i < 60; i++) {
    cm.update(0.016);
    await Promise.resolve();
  }
}

describe('Game3DSaveManager', () => {
  let manager;

  beforeEach(() => {
    useGameStore.getState().reset();
    manager = new Game3DSaveManager();
  });

  test('restores player, camera and character when given the store hook', async () => {
    const store = useGameStore.getState();
    store.updatePlayer({ position: [100, 30, 200], level: 7, xp: 55, health: 42, skillPoints: 3 });
    useGameStore.setState({ character: { ...store.character, attributePoints: 9 } });
    store.updateCamera({ distance: 33 });
    useGameStore.setState({ unlockedSpells: ['fireball', 'meteor'] });

    expect((await manager.saveGame(useGameStore, null, 'slotA')).success).toBe(true);

    useGameStore.getState().reset();
    const result = await manager.loadGame(useGameStore, null, 'slotA');
    expect(result.success).toBe(true);

    const s = useGameStore.getState();
    expect(s.player.position).toEqual([100, 30, 200]);
    expect(s.player.level).toBe(7);
    expect(s.player.xp).toBe(55);
    expect(s.player.health).toBe(42);
    expect(s.player.skillPoints).toBe(3);
    expect(s.camera.distance).toBe(33);
    expect(s.character.attributePoints).toBe(9);
    expect(s.unlockedSpells).toEqual(['fireball', 'meteor']);
    // Physics body is moved via an explicit teleport request
    expect(s.pendingTeleport).toEqual([100, 30, 200]);
  });

  test('does not persist transient combat state', async () => {
    useGameStore.getState().updatePlayer({ isInvincible: true, comboCount: 5, spellCooldowns: { fireball: 2 } });
    await manager.saveGame(useGameStore, null, 'slotB');
    const result = await manager.loadGame(useGameStore, null, 'slotB');
    expect(result.success).toBe(true);
    const p = useGameStore.getState().player;
    expect(p.isInvincible).toBe(false);
    expect(p.spellCooldowns).toEqual({});
  });

  test('saves world edits in unloaded chunks and reverts edits made after the save', async () => {
    const cm = new ChunkManager({ seed: 7, viewDistance: 2 });
    await loadChunksAround(cm, 0, 0);

    // Edit near spawn, then walk away so the chunk unloads
    expect(cm.setBlock(1, 61, 1, 5)).toBe(true);
    await loadChunksAround(cm, 5000, 5000);
    expect(cm.getChunk(0, 0)).toBeUndefined();

    // Edit far away too, then save (one loaded edit, one unloaded edit)
    expect(cm.setBlock(5001, 61, 5001, 4)).toBe(true);
    const saved = await manager.saveGame(useGameStore, cm, 'slotC');
    expect(saved.chunksSaved).toBe(2);

    // A post-save edit should be reverted on load
    cm.setBlock(5011, 61, 5001, 6);

    const loaded = await manager.loadGame(useGameStore, cm, 'slotC');
    expect(loaded.success).toBe(true);
    await loadChunksAround(cm, 5000, 5000);
    expect(cm.getBlock(5001, 61, 5001)).toBe(4);
    expect(cm.getBlock(5011, 61, 5001)).toBe(0);

    // The unloaded edit comes back when the player returns
    await loadChunksAround(cm, 0, 0);
    expect(cm.getBlock(1, 61, 1)).toBe(5);
  });

  test('saves and restores shaped cells (pieces), loaded and unloaded', async () => {
    const cm = new ChunkManager({ seed: 7, viewDistance: 2 });
    await loadChunksAround(cm, 0, 0);
    const slab = SHAPE.slab(AXIS.Y, [0]);
    const cubes = SHAPE.cubes(0b10010110);
    expect(cm.setCell(1, 61, 1, 3, slab)).toBe(true);
    await loadChunksAround(cm, 5000, 5000);
    expect(cm.setCell(5001, 61, 5001, 4, cubes)).toBe(true);
    expect((await manager.saveGame(useGameStore, cm, 'shapes1')).success).toBe(true);

    // Change both after the save; loading puts the shapes back
    cm.setBlock(5001, 61, 5001, 0);
    expect((await manager.loadGame(useGameStore, cm, 'shapes1')).success).toBe(true);
    await loadChunksAround(cm, 5000, 5000);
    expect(cm.getBlock(5001, 61, 5001)).toBe(4);
    expect(cm.getShape(5001, 61, 5001)).toBe(cubes);
    await loadChunksAround(cm, 0, 0);
    expect(cm.getBlock(1, 61, 1)).toBe(3);
    expect(cm.getShape(1, 61, 1)).toBe(slab);
  });

  test('loading repairs stockpiles saved with zero capacity', async () => {
    const bounds = { minX: 0, minZ: 0, maxX: 8, maxZ: 8 };
    useGameStore.setState({
      zones: [{ id: 'z1', type: 'STOCKPILE', bounds, storage: { items: { stone: 2 }, capacity: 0, usedCapacity: 2 } }],
    });
    await manager.saveGame(useGameStore, null, 'zones1');
    useGameStore.getState().reset();
    expect((await manager.loadGame(useGameStore, null, 'zones1')).success).toBe(true);

    const storage = useGameStore.getState().zones[0].storage;
    expect(storage.capacity).toBe(getStockpileCapacity(bounds));
    expect(storage.items).toEqual({ stone: 2 });
  });

  test('loading releases task claims held before the load', async () => {
    const zone = {
      id: 'mine1', type: 'MINING', bounds: { minX: 0, minZ: 0, maxX: 4, maxZ: 4 },
      miningTasks: [{ wx: 1, wy: 1, wz: 1, blockType: 1, status: 'pending' }],
    };
    scanForTasks([zone], [], null);
    const taskId = findBestTask({ id: 'npc_a', position: [0, 0, 0], skills: {} })?.id;
    expect(taskId).toBeTruthy();
    expect(claimTask(taskId, 'npc_a')).toBe(true);

    await manager.saveGame(useGameStore, null, 'tasks1');
    await manager.loadGame(useGameStore, null, 'tasks1');

    // The claim is gone: a rescan offers the block to any settler again
    scanForTasks([zone], [], null);
    const task = findBestTask({ id: 'npc_b', position: [0, 0, 0], skills: {} });
    expect(task).not.toBeNull();
    expect(task.claimedBy).toBeNull();
  });

  describe('rift state', () => {
    function closeFirstRift(rm) {
      const rift = rm.rifts[0];
      rift.spawnedMonsterIds = [];
      rm.beginClosing(rift.id, 0);
      rm.closeRift(rift.id);
      return rift.id;
    }

    test('a closed rift stays closed after save and load into a running game', async () => {
      const rm = new RiftManager(12345);
      useGameStore.getState().setRiftManager(rm);
      const riftId = closeFirstRift(rm);
      expect((await manager.saveGame(useGameStore, null, 'rifts1')).success).toBe(true);

      // Same session: the game recreated its rifts from the seed
      const fresh = new RiftManager(12345);
      useGameStore.getState().setRiftManager(fresh);
      expect((await manager.loadGame(useGameStore, null, 'rifts1')).success).toBe(true);

      expect(fresh.rifts.find((r) => r.id === riftId).state).toBe(RiftState.CLOSED);
      expect(useGameStore.getState()._pendingRiftState).toBeNull();
    });

    test('loading before the rift manager exists leaves the state pending', async () => {
      const rm = new RiftManager(12345);
      useGameStore.getState().setRiftManager(rm);
      const riftId = closeFirstRift(rm);
      await manager.saveGame(useGameStore, null, 'rifts2');

      useGameStore.getState().reset();
      useGameStore.getState().setRiftManager(null);
      expect((await manager.loadGame(useGameStore, null, 'rifts2')).success).toBe(true);

      const pending = useGameStore.getState()._pendingRiftState;
      expect(pending.rifts.find((r) => r.id === riftId).state).toBe(RiftState.CLOSED);
    });

    test('v6 saves without rift data load and keep seed-generated rifts', async () => {
      useGameStore.getState().setRiftManager(null);
      await manager.saveGame(useGameStore, null, 'rifts3');
      await new Promise((resolve, reject) => {
        const tx = manager.db.transaction(['saves'], 'readwrite');
        const store = tx.objectStore('saves');
        const req = store.get('rifts3');
        req.onsuccess = () => {
          const old = { ...req.result, version: 6 };
          delete old.rifts;
          store.put(old);
        };
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });

      const rm = new RiftManager(12345);
      useGameStore.getState().setRiftManager(rm);
      expect((await manager.loadGame(useGameStore, null, 'rifts3')).success).toBe(true);
      expect(rm.rifts.every((r) => r.state === RiftState.ACTIVE)).toBe(true);
      expect(useGameStore.getState()._pendingRiftState).toBeNull();
    });
  });

  test('rejects corrupted saves', () => {
    expect(validateSaveData(null)).not.toHaveLength(0);
    expect(validateSaveData({ player: { position: [1, 2] }, inventory: {} })).toContain('Invalid player position');
    expect(validateSaveData({ player: { position: [1, 2, 3] }, inventory: { materials: {} } })).toEqual([]);
  });
});
