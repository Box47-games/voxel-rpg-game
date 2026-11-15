/**
 * The player's last action feeds the player model's animation.
 */
import { notePlayerAction, getLastPlayerAction, clearPlayerAction } from '../playerActions';
import { performMeleeAttack } from '../../data/meleeAttack';

describe('playerActions', () => {
  beforeEach(() => clearPlayerAction());

  test('records the latest action with an increasing sequence number', () => {
    expect(getLastPlayerAction()).toBeNull();
    notePlayerAction('cast');
    const first = getLastPlayerAction();
    notePlayerAction('cast');
    expect(getLastPlayerAction().type).toBe('cast');
    expect(getLastPlayerAction().seq).toBeGreaterThan(first.seq);
  });

  test('a melee attack is noted even when nothing is in reach', () => {
    performMeleeAttack({ player: {} }, [0, 0, 0], 0, []);
    expect(getLastPlayerAction().type).toBe('melee');
  });
});
