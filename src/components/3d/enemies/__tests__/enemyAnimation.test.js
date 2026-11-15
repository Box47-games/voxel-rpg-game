/**
 * Procedural rift monster animation.
 */
import {
  ATTACK_DURATION,
  DEATH_DURATION,
  createEnemyAnimState,
  stepDeath,
  stepEnemyAnimation,
  triggerAttack,
  triggerHurt,
} from '../enemyAnimation';
import { ENEMY_MODELS } from '../enemyModels';
import { createRig, buildRigGeometry, applyBonePose } from '../../voxelRig';

const DT = 1 / 60;
const spec = (type) => ENEMY_MODELS[type].anim;

function run(type, motion, seconds, anim = createEnemyAnimState(0.3), before) {
  const poses = [];
  for (let t = 0; t < seconds; t += DT) {
    before?.(anim, t);
    poses.push(stepEnemyAnimation(anim, spec(type), motion, DT));
  }
  return { poses, anim };
}

const range = (values) => Math.max(...values) - Math.min(...values);
const get = (pose, bone, key, dflt = 0) => pose.bones[bone]?.[key] ?? dflt;

describe('slime', () => {
  test('hops along: up stretched, down squashed', () => {
    const { poses } = run('slime', { speed: 2, alert: true }, 2);
    const lifts = poses.map((p) => get(p, 'body', 'lift'));
    expect(Math.max(...lifts)).toBeGreaterThan(0.4);
    const airborne = poses.find((p) => get(p, 'body', 'lift') > 0.4);
    expect(get(airborne, 'body', 'sy', 1)).toBeGreaterThan(1.1);
    expect(Math.min(...poses.map((p) => get(p, 'body', 'sy', 1)))).toBeLessThan(0.85);
  });

  test('jiggles but stays put when still', () => {
    const { poses } = run('slime', { speed: 0 }, 2);
    expect(poses.every((p) => !get(p, 'body', 'lift'))).toBe(true);
    expect(range(poses.map((p) => get(p, 'body', 'sy', 1)))).toBeGreaterThan(0.05);
  });

  test('melts into a puddle when it dies', () => {
    const { pose, tilt } = stepDeath(spec('slime'), DEATH_DURATION);
    expect(get(pose, 'body', 'sy', 1)).toBeLessThan(0.3);
    expect(get(pose, 'body', 'sx', 1)).toBeGreaterThan(1.3);
    expect(tilt).toBe(0);
  });
});

describe('bipeds', () => {
  test('a walking goblin swings legs and arms in opposition', () => {
    const { poses } = run('goblin', { speed: 2.5, alert: true }, 2);
    for (const p of poses.slice(-30)) {
      expect(get(p, 'legL', 'rx')).toBeCloseTo(-get(p, 'legR', 'rx'), 6);
      if (Math.abs(get(p, 'legL', 'rx')) > 0.2) {
        expect(Math.sign(get(p, 'armL', 'rx'))).toBe(-Math.sign(get(p, 'legL', 'rx')));
      }
    }
    expect(range(poses.slice(-60).map((p) => get(p, 'legL', 'rx')))).toBeGreaterThan(1);
  });

  test('an attack raises the weapon overhead and brings it down', () => {
    const anim = createEnemyAnimState(0.2);
    triggerAttack(anim);
    const { poses } = run('goblin', { speed: 0, alert: true }, ATTACK_DURATION + 0.2, anim);
    const arm = poses.map((p) => get(p, 'armR', 'rx'));
    const highest = Math.min(...arm);
    expect(highest).toBeLessThan(-2.2);
    expect(arm.indexOf(highest)).toBeLessThan(arm.length / 2); // the swing comes early
    expect(arm.at(-1)).toBeCloseTo(spec('goblin').weaponRest, 1); // and returns to the ready stance
    expect(anim.attack).toBe(-1);
  });

  test('skeletons rattle their skulls', () => {
    const { poses } = run('skeleton', { speed: 0, alert: true }, 1);
    expect(range(poses.map((p) => get(p, 'head', 'rz')))).toBeGreaterThan(0.05);
    const goblin = run('goblin', { speed: 0, alert: true }, 1).poses;
    expect(goblin.every((p) => !get(p, 'head', 'rz'))).toBe(true);
  });

  test('idle monsters glance around; alert ones look ahead', () => {
    const idle = run('goblin', { speed: 0 }, 12).poses;
    expect(Math.max(...idle.map((p) => Math.abs(get(p, 'head', 'ry'))))).toBeGreaterThan(0.4);
    const alert = run('goblin', { speed: 0, alert: true }, 4).poses;
    expect(Math.abs(get(alert.at(-1), 'head', 'ry'))).toBeLessThan(0.05);
  });

  test('topple over when they die', () => {
    const early = stepDeath(spec('skeleton'), 0.1);
    const late = stepDeath(spec('skeleton'), DEATH_DURATION);
    expect(late.tilt).toBeCloseTo(Math.PI / 2, 2);
    expect(early.tilt).toBeLessThan(late.tilt);
    expect(early.fade).toBe(0);
    expect(late.fade).toBe(1);
  });
});

describe('shadow creeper', () => {
  test('scuttles on alternating tripods', () => {
    const { poses } = run('shadow', { speed: 3, alert: true }, 2);
    const p = poses.at(-1);
    // Same tripod, same side: same sweep; opposite tripods on one side: opposite sweep
    expect(get(p, 'legFL', 'ry')).toBeCloseTo(get(p, 'legBL', 'ry'), 6);
    expect(get(p, 'legML', 'ry')).toBeCloseTo(-get(p, 'legFL', 'ry'), 6);
    expect(range(poses.slice(-60).map((q) => get(q, 'legFL', 'ry')))).toBeGreaterThan(0.6);
  });

  test('rears up to strike', () => {
    const anim = createEnemyAnimState(0.4);
    triggerAttack(anim);
    const { poses } = run('shadow', { speed: 0, alert: true }, ATTACK_DURATION, anim);
    expect(Math.min(...poses.map((p) => get(p, 'body', 'rx')))).toBeLessThan(-0.35);
  });

  test('curls its legs and rolls over when it dies', () => {
    const { pose, tilt } = stepDeath(spec('shadow'), DEATH_DURATION);
    expect(get(pose, 'legFL', 'rz')).toBeGreaterThan(1);
    expect(get(pose, 'legFR', 'rz')).toBeLessThan(-1);
    expect(tilt).toBeGreaterThan(1.4);
  });
});

test('a hit makes any monster recoil', () => {
  for (const type of Object.keys(ENEMY_MODELS)) {
    const anim = createEnemyAnimState(0.5);
    triggerHurt(anim);
    const { poses } = run(type, { speed: 0, alert: true }, 0.15, anim);
    expect(get(poses.at(-1), 'body', 'rx')).toBeLessThan(get(run(type, { speed: 0, alert: true }, 0.15).poses.at(-1), 'body', 'rx'));
  }
});

test('applyBonePose resets bones the pose leaves out', () => {
  const model = ENEMY_MODELS.goblin;
  const rig = createRig(model, buildRigGeometry(model));
  applyBonePose(rig, { bones: { armR: { rx: -2, lift: 0.1, sy: 1.2 } } });
  expect(rig.bones.armR.rotation.x).toBe(-2);
  expect(rig.bones.armR.position.y).toBeCloseTo(rig.rest.armR.y + 0.1);
  expect(rig.bones.armR.scale.y).toBe(1.2);
  applyBonePose(rig, { bones: {} });
  expect(rig.bones.armR.rotation.x).toBe(0);
  expect(rig.bones.armR.position.y).toBeCloseTo(rig.rest.armR.y);
  expect(rig.bones.armR.scale.y).toBe(1);
});
