/**
 * Voxel humanoids (player and settlers): looks, tools and animation.
 */
import * as THREE from 'three';
import {
  HUMANOID_BONES,
  PLAYER_LOOK,
  TOOL_BONES,
  buildHumanoidModel,
  createHumanoidInstance,
  getSettlerLook,
  rgbToHex,
  SETTLER_UNIT,
} from '../humanoidModel';
import {
  ACTION_DURATION,
  createHumanoidAnimState,
  stepHumanoidAnimation,
  triggerAction,
} from '../humanoidAnimation';
import { applyBonePose, getModelBounds } from '../../voxelRig';
import { generateNPCIdentity } from '../../../../data/npcIdentity';
import { getSettlerActivity } from '../../SettlerNPC';

const DT = 1 / 60;
const settler = (job, i = 1) => ({ ...generateNPCIdentity(100 + i), id: `npc_${i}`, preferredJob: job });

function run(motion, seconds, anim = createHumanoidAnimState(0.3), each) {
  const poses = [];
  for (let t = 0; t < seconds; t += DT) {
    each?.(anim, t);
    poses.push(stepHumanoidAnimation(anim, motion, DT));
  }
  return { poses, anim };
}
const range = (v) => Math.max(...v) - Math.min(...v);
const get = (pose, bone, key, d = 0) => pose.bones[bone]?.[key] ?? d;
const shown = (pose, tool) => get(pose, tool, 'sx', 1) > 0;

describe('looks', () => {
  test('the player is a caped adventurer about as tall as the collider (2.8)', () => {
    const model = buildHumanoidModel(PLAYER_LOOK);
    const { min, max } = getModelBounds(model, null, (b) => !TOOL_BONES.includes(b));
    expect(min[1]).toBeCloseTo(0, 5);
    expect(max[1]).toBeGreaterThan(2.5);
    expect(max[1]).toBeLessThan(2.9);
    expect(model.parts.some(([bone]) => bone === 'cape')).toBe(true);
  });

  test('the player wears a leather jerkin and bracers over a green shirt; settlers do not', () => {
    const player = buildHumanoidModel(PLAYER_LOOK);
    const uses = (model, color) => model.parts.some(([, c]) => c === color);
    expect(uses(player, 'jerkin')).toBe(true);
    expect(uses(player, 'jerkinDark')).toBe(true);
    expect(player.colors.shirt).toBe('#4a8a3a');
    const settlerModel = buildHumanoidModel(getSettlerLook({ id: 's1', preferredJob: 'miner' }));
    expect(uses(settlerModel, 'jerkin')).toBe(false);
    expect(uses(settlerModel, 'bootSole')).toBe(false);
  });

  test('settlers wear their job: straw hats for farmers, helmets for guards', () => {
    expect(getSettlerLook(settler('farmer')).hat).toBe('straw');
    expect(getSettlerLook(settler('guard')).hat).toBe('helmet');
    expect(getSettlerLook(settler('guard')).sheathedSword).toBe(true);
    expect(getSettlerLook(settler('builder')).apron).toBeTruthy();
    const farmer = buildHumanoidModel(getSettlerLook(settler('farmer')));
    expect(farmer.parts.some(([, color]) => color === 'straw')).toBe(true);
  });

  test('a settler keeps their identity colors and the same look every time', () => {
    const npc = settler('miner', 7);
    const look = getSettlerLook(npc);
    expect(look.skin).toBe(rgbToHex(npc.appearance.skinColor));
    expect(look.shirt).toBe(rgbToHex(npc.appearance.clothingPrimary));
    expect(getSettlerLook(npc)).toEqual(look);
    const styles = new Set(Array.from({ length: 40 }, (_, i) => getSettlerLook(settler('farmer', i)).hairStyle));
    expect(styles.size).toBeGreaterThan(3);
  });

  test('every hair style, hat and extra builds', () => {
    for (const hairStyle of ['short', 'long', 'ponytail', 'bun', 'bald', 'spiky', 'swept']) {
      for (const hat of [null, 'straw', 'cap', 'miner', 'helmet']) {
        const rig = createHumanoidInstance({ ...PLAYER_LOOK, hairStyle, hat, beard: true, apron: '#884422' });
        expect(rig.mesh).toBeInstanceOf(THREE.SkinnedMesh);
        rig.dispose();
      }
    }
  });
});

describe('createHumanoidInstance', () => {
  test('tools start hidden; identical looks share geometry', () => {
    const a = createHumanoidInstance(PLAYER_LOOK);
    const b = createHumanoidInstance({ ...PLAYER_LOOK });
    expect(Object.keys(a.bones)).toEqual(HUMANOID_BONES);
    for (const tool of TOOL_BONES) expect(a.bones[tool].scale.x).toBe(0);
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.mesh.skeleton).not.toBe(b.mesh.skeleton);
  });

  test('settlers are smaller than the player', () => {
    const look = getSettlerLook(settler('farmer'));
    expect(SETTLER_UNIT).toBeLessThan(0.1);
    const small = createHumanoidInstance(look, { unit: SETTLER_UNIT });
    const big = createHumanoidInstance(look);
    expect(small.mesh.geometry).not.toBe(big.mesh.geometry);
    expect(small.mesh.geometry.boundingBox.max.y).toBeLessThan(big.mesh.geometry.boundingBox.max.y);
  });
});

describe('animation', () => {
  test('walking swings arms against legs; running swings harder and leans in', () => {
    const walk = run({ speed: 2.5 }, 2).poses.slice(-60);
    const sprint = run({ speed: 9 }, 2).poses.slice(-60);
    for (const p of walk) {
      expect(get(p, 'legL', 'rx')).toBeCloseTo(-get(p, 'legR', 'rx'), 6);
      if (Math.abs(get(p, 'legL', 'rx')) > 0.1) {
        expect(Math.sign(get(p, 'armL', 'rx'))).toBe(-Math.sign(get(p, 'legL', 'rx')));
      }
    }
    expect(range(sprint.map((p) => get(p, 'legL', 'rx')))).toBeGreaterThan(range(walk.map((p) => get(p, 'legL', 'rx'))));
    expect(get(sprint.at(-1), 'body', 'rx')).toBeGreaterThan(0.1);
  });

  test('jumping tucks one leg and throws the arms out', () => {
    const { poses } = run({ speed: 0, airborne: true }, 0.5);
    const p = poses.at(-1);
    expect(get(p, 'legL', 'rx')).toBeLessThan(-0.4);
    expect(get(p, 'armL', 'rz')).toBeGreaterThan(0.4);
    expect(get(p, 'armR', 'rz')).toBeLessThan(-0.4);
  });

  test('the cape streams back faster at speed', () => {
    const still = run({ speed: 0 }, 1).poses.at(-1);
    const fast = run({ speed: 8 }, 1).poses.at(-1);
    expect(get(fast, 'cape', 'rx')).toBeLessThan(get(still, 'cape', 'rx') - 0.3);
  });

  test('a melee attack shows the sword, raises it and slashes down, then puts it away', () => {
    const anim = createHumanoidAnimState(0.1);
    triggerAction(anim, 'melee');
    const { poses } = run({ speed: 0 }, ACTION_DURATION.melee + 0.1, anim);
    const during = poses.slice(0, Math.floor(ACTION_DURATION.melee / DT) - 1);
    expect(during.every((p) => shown(p, 'toolSword'))).toBe(true);
    const arm = during.map((p) => get(p, 'armR', 'rx'));
    expect(Math.min(...arm)).toBeLessThan(-2.3);
    expect(arm.at(-1)).toBeGreaterThan(-1);
    expect(shown(poses.at(-1), 'toolSword')).toBe(false);
  });

  test('casting thrusts both hands forward without a weapon', () => {
    const anim = createHumanoidAnimState(0.1);
    triggerAction(anim, 'cast');
    const { poses } = run({ speed: 0 }, ACTION_DURATION.cast * 0.4, anim);
    const p = poses.at(-1);
    expect(get(p, 'armL', 'rx')).toBeLessThan(-1.3);
    expect(get(p, 'armR', 'rx')).toBeLessThan(-1.3);
    expect(TOOL_BONES.some((t) => shown(p, t))).toBe(false);
  });

  test('each activity uses its own tool, and only that one', () => {
    const tools = { mine: 'toolPick', build: 'toolHammer', farm: 'toolHoe', carry: 'carry' };
    for (const [activity, tool] of Object.entries(tools)) {
      const p = run({ speed: 0, activity }, 0.5).poses.at(-1);
      for (const t of TOOL_BONES) expect(shown(p, t)).toBe(t === tool);
    }
    const mining = run({ speed: 0, activity: 'mine' }, 2).poses;
    expect(range(mining.map((p) => get(p, 'armR', 'rx')))).toBeGreaterThan(2); // full swings
  });

  test('carrying holds the crate out front while walking', () => {
    const p = run({ speed: 2, activity: 'carry' }, 1).poses.at(-1);
    expect(get(p, 'armL', 'rx')).toBeLessThan(-1);
    expect(Math.abs(get(p, 'legL', 'rx'))).toBeGreaterThan(0);
  });

  test('applying a pose hides and shows tool bones on the rig', () => {
    const rig = createHumanoidInstance(PLAYER_LOOK);
    applyBonePose(rig, run({ speed: 0, activity: 'mine' }, 0.2).poses.at(-1));
    expect(rig.bones.toolPick.scale.x).toBe(1);
    expect(rig.bones.toolSword.scale.x).toBe(0);
    applyBonePose(rig, run({ speed: 0 }, 0.2).poses.at(-1));
    expect(rig.bones.toolPick.scale.x).toBe(0);
  });
});

describe('getSettlerActivity', () => {
  test('work animations play on site; carrying plays on the move', () => {
    expect(getSettlerActivity({ state: 'WORKING_MINE' }, false)).toBe('mine');
    expect(getSettlerActivity({ state: 'WORKING_MINE' }, true)).toBeNull();
    expect(getSettlerActivity({ state: 'WORKING_BUILD' }, false)).toBe('build');
    expect(getSettlerActivity({ state: 'WORKING_FARM' }, false)).toBe('farm');
    expect(getSettlerActivity({ state: 'WORKING_HAUL', carryingItem: { material: 'wood' } }, true)).toBe('carry');
    expect(getSettlerActivity({ state: 'WORKING_HAUL', carryingItem: null }, true)).toBeNull();
    expect(getSettlerActivity({ state: 'EATING' }, false)).toBe('eat');
    expect(getSettlerActivity({ state: 'SOCIALIZING' }, false)).toBe('wave');
    expect(getSettlerActivity({ state: 'IDLE' }, false)).toBeNull();
  });
});

describe('jumping', () => {
  test('rising: a knee driven up and arms reaching; falling: arms spread for balance', () => {
    const rising = run({ speed: 0, airborne: true, vy: 10 }, 0.6).poses.at(-1);
    const falling = run({ speed: 0, airborne: true, vy: -10 }, 0.6).poses.at(-1);
    expect(get(rising, 'legL', 'rx')).toBeLessThan(get(falling, 'legL', 'rx') - 0.4);
    expect(get(rising, 'armL', 'rx')).toBeLessThan(get(falling, 'armL', 'rx') - 0.5);
    expect(get(falling, 'armL', 'rz')).toBeGreaterThan(get(rising, 'armL', 'rz') + 0.5);
  });

  test('back on the ground the jump pose fades out', () => {
    const { anim } = run({ speed: 0, airborne: true, vy: -10 }, 0.6);
    const landed = run({ speed: 0, airborne: false, vy: 0 }, 1, anim).poses.at(-1);
    expect(Math.abs(get(landed, 'armL', 'rz'))).toBeLessThan(0.2);
  });
});
