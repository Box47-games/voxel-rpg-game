/**
 * Melee and AOE spells against rift enemies (plain data + registered handlers).
 */
import useGameStore from '../../../stores/useGameStore';
import { performMeleeAttack } from '../../../data/meleeAttack';
import { executeSpell, getSpellById } from '../../../data/spells';

function spawnRiftEnemy(id, pos) {
  const handler = { takeDamage: vi.fn(), applyStatusEffect: vi.fn() };
  const state = useGameStore.getState();
  state._enemyHandlers.set(id, handler);
  state._enemyPositions.set(id, pos);
  useGameStore.setState({ enemies: [...state.enemies, { id, type: 'slime', position: [999, 0, 999] }] });
  return handler;
}

describe('combat against rift enemies', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    useGameStore.getState()._enemyHandlers.clear();
    useGameStore.getState()._enemyPositions.clear();
  });

  test('melee hits a rift enemy at its live position', () => {
    const handler = spawnRiftEnemy('rift_1', [1, 0, 1]);
    const s = useGameStore.getState();
    const res = performMeleeAttack(s, [0, 0, 0], Math.atan2(1, 1), s.enemies);
    expect(res.enemiesHit).toBe(1);
    expect(handler.takeDamage).toHaveBeenCalledTimes(1);
  });

  test('frost nova damages and stuns enemies around the player', () => {
    const near = spawnRiftEnemy('near', [3, 0, 0]);
    const far = spawnRiftEnemy('far', [40, 0, 0]);
    const s = useGameStore.getState();
    const result = executeSpell(getSpellById('frostNova'), { ...s.player, position: [0, 0, 0] }, s);
    expect(result.success).toBe(true);
    expect(near.takeDamage).toHaveBeenCalled();
    expect(near.applyStatusEffect).toHaveBeenCalledWith(expect.objectContaining({ type: 'stun' }));
    expect(far.takeDamage).not.toHaveBeenCalled();
  });

  test('meteor targets the nearest enemy in front of the player', () => {
    const ahead = spawnRiftEnemy('ahead', [0, 0, 20]);
    const behind = spawnRiftEnemy('behind', [0, 0, -20]);
    const s = useGameStore.getState();
    executeSpell(getSpellById('meteor'), { ...s.player, position: [0, 0, 0], facingAngle: 0 }, s);
    expect(ahead.takeDamage).toHaveBeenCalled();
    expect(behind.takeDamage).not.toHaveBeenCalled();
  });
});

describe('clicking beside an enemy', () => {
  // A flat "camera": projects world x/z straight onto NDC (-50..50 → -1..1)
  const camera = {};
  const toVector = ([x, , z]) => ({ project: () => ({ x: x / 50, y: -z / 50, z: 0 }) });
  const size = { width: 1000, height: 1000 };

  beforeEach(() => useGameStore.getState().reset());

  test('finds the nearest enemy within the radius in screen pixels', async () => {
    const { enemyNearScreenPoint } = await import('../enemyHits');
    spawnRiftEnemy('a', [0, 0, 0]); // screen (500, 500)
    spawnRiftEnemy('b', [2, 0, 0]); // screen (520, 500)
    const s = useGameStore.getState();
    expect(enemyNearScreenPoint(s, camera, { x: 525, y: 500 }, size, 36, toVector).enemy.id).toBe('b');
    expect(enemyNearScreenPoint(s, camera, { x: 470, y: 500 }, size, 36, toVector).enemy.id).toBe('a');
    expect(enemyNearScreenPoint(s, camera, { x: 600, y: 600 }, size, 36, toVector)).toBeNull();
  });
});
