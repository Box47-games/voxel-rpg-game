import { RiftManager, RiftState } from '../RiftManager';
import { RIFT_ANCHOR_HEALTH } from '../../../data/tuning';

const SEED = 12345;

function closableRift(rm) {
  const rift = rm.rifts[0];
  rift.spawnedMonsterIds = [];
  return rift;
}

describe('RiftManager persistence', () => {
  test('a closed rift stays closed in a fresh manager with the same seed', () => {
    const rm = new RiftManager(SEED);
    expect(rm.rifts.length).toBeGreaterThan(1);
    const rift = closableRift(rm);
    rm.beginClosing(rift.id, 10);
    rm.closeRift(rift.id);

    const restored = new RiftManager(SEED);
    restored.deserialize(JSON.parse(JSON.stringify(rm.serialize())));

    const r = restored.rifts.find((x) => x.id === rift.id);
    expect(r.state).toBe(RiftState.CLOSED);
    expect(r.corruptionProgress).toBe(0);
    expect(restored.rifts.filter((x) => x.state === RiftState.CLOSED)).toHaveLength(1);
  });

  test('a rift saved mid-closing resumes CLOSING with the same progress and anchor health', () => {
    const rm = new RiftManager(SEED);
    const rift = closableRift(rm);
    rm.beginClosing(rift.id, 50);
    rift.corruptionProgress = 0.42;
    rm.damageAnchor(rift.id, 30);

    const restored = new RiftManager(SEED);
    restored.deserialize(rm.serialize());

    const r = restored.rifts.find((x) => x.id === rift.id);
    expect(r.state).toBe(RiftState.CLOSING);
    expect(r.corruptionProgress).toBe(0.42);
    expect(r.anchorHealth).toBe(RIFT_ANCHOR_HEALTH - 30);
    // First wave is due shortly after the anchor went down (interval - first delay earlier)
    expect(r.lastReinforcementTime).toBe(rift.lastReinforcementTime);
    expect(restored.getClosingRifts().map((x) => x.id)).toEqual([rift.id]);
  });

  test('restores wounded state and keeps monster IDs unique', () => {
    const rm = new RiftManager(SEED);
    const rift = closableRift(rm);
    rm.beginClosing(rift.id, 0);
    rm.damageAnchor(rift.id, RIFT_ANCHOR_HEALTH);
    rm.nextMonsterId = 40;

    const restored = new RiftManager(SEED);
    restored.deserialize(rm.serialize());

    expect(restored.rifts.find((x) => x.id === rift.id).state).toBe(RiftState.WOUNDED);
    expect(restored.nextMonsterId).toBe(40);
  });

  test('resets spawn timers on load', () => {
    const rm = new RiftManager(SEED);
    const restored = new RiftManager(SEED);
    restored.rifts[0].lastSpawnTime = 999;
    restored.deserialize(rm.serialize());
    expect(restored.rifts[0].lastSpawnTime).toBe(0);
  });

  test('ignores data from another seed, unknown rifts and invalid states', () => {
    const rm = new RiftManager(SEED);
    const before = JSON.stringify(rm.serialize());

    rm.deserialize({ seed: 999, rifts: [{ id: 'rift-0', state: RiftState.CLOSED }] });
    rm.deserialize({ seed: SEED, rifts: [{ id: 'rift-nope', state: RiftState.CLOSED }] });
    rm.deserialize({ seed: SEED, rifts: [{ id: 'rift-0', state: 'EXPLODED' }] });
    rm.deserialize(null);

    expect(JSON.stringify(rm.serialize())).toBe(before);
  });

  test('reinforcements carry the closing rift as their target', () => {
    const rm = new RiftManager(SEED);
    const rift = closableRift(rm);
    rm.beginClosing(rift.id, 0);
    const spawns = rm.getReinforcementSpawns(rift, 1000);
    expect(spawns.length).toBeGreaterThan(0);
    for (const s of spawns) {
      expect(s.targetRiftId).toBe(rift.id);
      expect(s.targetPosition).toEqual([rift.x, 0, rift.z]);
    }
  });
});
