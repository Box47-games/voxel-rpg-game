/**
 * enemyModels.js — Voxel models for the rift monsters.
 *
 * Built with the shared rig format in ../voxelRig.js (facing +Z, feet on
 * Y = 0, left side +X). Each monster has its own bones: the slime is one
 * squashy body with a face, the goblin and skeleton are bipeds that swing a
 * weapon in their right arm, and the shadow creeper scuttles on six legs.
 * `glow` parts (eyes, veins) stay bright in the dark.
 *
 * `anim` tunes enemyAnimation.js: gait (hop | biped | crawl), stride or
 * hopRate, swing (radians), and per-gait extras (hunch, rattle, and
 * weaponRest: how far forward the weapon arm is held, which tilts the
 * forward-pointing weapon up into a ready stance).
 */

import {
  pair,
  sym,
  getModelBounds,
  getColliderBox as getRigColliderBox,
  buildRigGeometry,
  createGeometryCache,
  createRig,
} from '../voxelRig';

const SLIME = {
  unit: 0.1,
  colors: {
    gel: '#4fd65a', gelDark: '#2f9e3c', gelLight: '#a4f7a8', eye: '#f4fff2',
    pupil: '#10240f', mouth: '#163d1a', brow: '#24722f',
  },
  bones: {
    // Pivot at the base so squash and stretch keep it on the ground
    body: { pivot: [0, 0, 0] },
    head: { pivot: [0, 4, 7], parent: 'body' },
  },
  parts: [
    ['body', 'gelDark', [15, 1.6, 15], [0, 0.8, 0]],
    ['body', 'gel', [14, 6.4, 14], [0, 4.8, 0]],
    ['body', 'gel', [12, 3, 12], [0, 9.5, 0]],
    ['body', 'gel', [9, 2, 9], [0, 12, 0]],
    ['body', 'gelLight', [3, 0.3, 2], [-2, 13.1, -1]],
    ['body', 'gelLight', [1.2, 0.3, 1.2], [1.4, 13.1, 1.6]],
    ['body', 'gelLight', [0.4, 1.4, 1.4], [7.1, 6.4, -2]],
    ['body', 'gelLight', [1.2, 1.2, 0.4], [4.6, 9.4, 6.1]],
    ['body', 'gelLight', [0.4, 1, 1], [-7.1, 3.6, 3]],
    ['body', 'gel', [2, 2.4, 1], [-4.6, 3, 7.4]], // drips
    ['body', 'gel', [1.6, 1.6, 1], [5.4, 2.2, -7.4]],
    // Face (on the head bone so it can lean and squint)
    ...sym('head', 'eye', [3, 3, 0.6], [3, 5, 7.2]),
    ...sym('head', 'pupil', [1.4, 1.8, 0.4], [2.5, 4.7, 7.5]),
    ...sym('head', 'brow', [2, 0.7, 0.5], [1.8, 6.4, 7.35]),
    ...sym('head', 'brow', [2, 0.7, 0.5], [3.8, 7, 7.35]),
    ['head', 'mouth', [4.6, 1, 0.4], [0, 2.2, 7.25]],
    ...sym('head', 'eye', [0.8, 0.8, 0.4], [1.4, 2.6, 7.35]),
  ],
  hitboxBones: ['body'],
  anim: { gait: 'hop', hopRate: 1.4, hopHeight: 0.55 },
};

const GOBLIN = {
  unit: 0.09,
  colors: {
    skin: '#7fa83f', skinDark: '#5f8530', tunic: '#7a5230', tunicDark: '#5c3d22',
    belt: '#3b2a1c', buckle: '#c9a23a', eye: '#ffd23a', pupil: '#1a1a10',
    tooth: '#efe6c8', mouth: '#2a1a14', earIn: '#b06a5a', club: '#8a6239',
    clubDark: '#6a4a2a', nail: '#9aa0a6',
  },
  bones: {
    body: { pivot: [0, 9, 0] },
    head: { pivot: [0, 15, 0.5], parent: 'body' },
    armL: { pivot: [4.4, 14.4, 0], parent: 'body' },
    armR: { pivot: [-4.4, 14.4, 0], parent: 'body' },
    legL: { pivot: [1.8, 9, 0] },
    legR: { pivot: [-1.8, 9, 0] },
  },
  parts: [
    // Legs: ragged shorts, bare green feet
    ...pair('leg', 'tunicDark', [3, 4, 3], [1.8, 7, 0]),
    ...pair('leg', 'skin', [2.4, 4.6, 2.4], [1.8, 2.8, 0]),
    ...pair('leg', 'skin', [2.8, 1.2, 4], [1.8, 0.6, 0.7]),
    ...pair('leg', 'skinDark', [2.8, 0.6, 0.6], [1.8, 0.3, 2.8]),
    // Body: leather tunic and belt
    ['body', 'tunic', [7, 6, 4], [0, 12, 0]],
    ['body', 'tunicDark', [7.4, 2.4, 4.4], [0, 8.6, 0]],
    ['body', 'belt', [7.2, 1.2, 4.2], [0, 10, 0]],
    ['body', 'buckle', [1.4, 1, 0.3], [0, 10, 2.2]],
    ['body', 'tunicDark', [7.4, 0.8, 4.4], [0, 15, 0]],
    ['body', 'tunicDark', [1.2, 5, 0.3], [-1.6, 12.4, 2.05]], // strap
    // Big head: long ears, hooked nose, yellow eyes, snaggle teeth
    ['head', 'skin', [7, 6, 6], [0, 18.2, 0.8]],
    ['head', 'skinDark', [7.2, 0.8, 1], [0, 20, 3.4]],
    ...sym('head', 'skin', [4, 1.6, 1], [5.4, 19, 0.4]),
    ...sym('head', 'skin', [2.2, 1.2, 0.8], [8.4, 19.6, 0.2]),
    ...sym('head', 'earIn', [3, 0.8, 0.2], [5.2, 19, 0.95]),
    ['head', 'skinDark', [1.6, 2.4, 2], [0, 17.6, 4.6]],
    ['head', 'skinDark', [1.4, 1, 0.8], [0, 16.6, 5.6]],
    ...sym('head', 'eye', [1.8, 1.1, 0.3], [1.9, 19, 3.9], { glow: true }),
    ...sym('head', 'pupil', [0.6, 1.1, 0.3], [1.6, 19, 4.05]),
    ['head', 'mouth', [3.6, 0.7, 0.3], [0, 15.9, 3.9]],
    ...sym('head', 'tooth', [0.6, 0.8, 0.3], [1.1, 16.2, 4]),
    ['head', 'skinDark', [0.6, 1.4, 0.6], [0.6, 21.6, 0.4]], // a few hairs
    ['head', 'skinDark', [0.6, 1, 0.6], [-1, 21.4, -0.6]],
    // Long arms
    ...pair('arm', 'skin', [2.2, 5, 2.2], [4.4, 12, 0]),
    ...pair('arm', 'skin', [2, 4, 2], [4.4, 7.8, 0.2]),
    ...pair('arm', 'skinDark', [2.4, 2, 2.4], [4.4, 5.4, 0.4]),
    // Spiked club in the right hand, pointing forward
    ['armR', 'clubDark', [1, 1, 6], [-4.4, 5.4, 3]],
    ['armR', 'club', [2.8, 2.8, 5], [-4.4, 5.6, 7.6]],
    ['armR', 'clubDark', [2.9, 0.6, 0.6], [-4.4, 5.6, 6]],
    ['armR', 'nail', [0.6, 0.6, 0.6], [-4.4, 7.3, 7.4]],
    ['armR', 'nail', [0.6, 0.6, 0.6], [-6.1, 5.4, 8.6]],
    ['armR', 'nail', [0.6, 0.6, 0.6], [-2.7, 6, 9.4]],
  ],
  hitboxBones: ['body', 'head', 'legL', 'legR'],
  anim: { gait: 'biped', stride: 1.6, swing: 0.7, hunch: 0.18, weaponRest: -0.75 },
};

const SKELETON = {
  unit: 0.1,
  colors: {
    bone: '#e2dccb', boneDark: '#b8b09a', teeth: '#f4eedf', socket: '#1a1414',
    eye: '#ff5a2a', blade: '#a8adb2', rust: '#8a5a3a', hilt: '#5a3d28', cloth: '#4a3f55',
  },
  bones: {
    body: { pivot: [0, 12, 0] },
    head: { pivot: [0, 21.6, 0], parent: 'body' },
    armL: { pivot: [3.8, 20.6, 0], parent: 'body' },
    armR: { pivot: [-3.8, 20.6, 0], parent: 'body' },
    legL: { pivot: [1.6, 12, 0] },
    legR: { pivot: [-1.6, 12, 0] },
  },
  parts: [
    // Legs
    ...pair('leg', 'bone', [1.2, 5, 1.2], [1.6, 9.2, 0]),
    ...pair('leg', 'boneDark', [1.6, 1.2, 1.6], [1.6, 6.4, 0]),
    ...pair('leg', 'bone', [1.1, 5.2, 1.1], [1.6, 3.4, 0]),
    ...pair('leg', 'bone', [2, 0.8, 3.2], [1.6, 0.4, 0.6]),
    // Pelvis, spine and rib cage
    ['body', 'bone', [5, 2, 2.6], [0, 12.4, 0]],
    ['body', 'cloth', [5.4, 3, 2.8], [0, 11.2, 0]],
    ['body', 'cloth', [2.6, 2, 0.4], [0.6, 9.2, 1.3]],
    ['body', 'cloth', [1.6, 1.4, 0.4], [-1.4, 9.6, 1.3]],
    ['body', 'boneDark', [1.2, 8.6, 1.2], [0, 17.4, -0.6]],
    ['body', 'bone', [5.4, 0.8, 3.2], [0, 15, 0]],
    ['body', 'bone', [6.4, 0.8, 3.6], [0, 16.6, 0]],
    ['body', 'bone', [6.6, 0.8, 3.8], [0, 18.2, 0]],
    ['body', 'bone', [6.2, 0.8, 3.6], [0, 19.8, 0]],
    ['body', 'bone', [0.8, 5.6, 0.6], [0, 17.6, 1.9]],
    ['body', 'bone', [8, 1, 1.4], [0, 21, 0]],
    // Skull with glowing sockets
    ['head', 'boneDark', [1, 1.4, 1], [0, 22.2, 0]],
    ['head', 'bone', [5, 4.6, 5], [0, 25.2, 0.2]],
    ['head', 'boneDark', [3.8, 1.4, 3.4], [0, 22.4, 0.9]],
    ['head', 'teeth', [3.2, 0.6, 0.3], [0, 23.3, 2.65]],
    ...sym('head', 'socket', [1.4, 1.4, 0.4], [1.2, 25.2, 2.6]),
    ...sym('head', 'eye', [0.6, 0.6, 0.3], [1.2, 25.2, 2.75], { glow: true }),
    ['head', 'socket', [0.6, 0.8, 0.3], [0, 24, 2.7]],
    ['head', 'boneDark', [0.3, 1.6, 0.3], [1.6, 27, 2.6]], // crack
    // Arms
    ...pair('arm', 'boneDark', [1.6, 1.6, 1.6], [3.8, 20.6, 0]),
    ...pair('arm', 'bone', [1, 5, 1], [3.8, 17.6, 0]),
    ...pair('arm', 'boneDark', [1.4, 1, 1.4], [3.8, 15, 0]),
    ...pair('arm', 'bone', [0.9, 4.4, 0.9], [3.8, 12.6, 0]),
    ...pair('arm', 'bone', [1.4, 1.6, 1.2], [3.8, 9.8, 0.2]),
    // Rusty sword in the right hand
    ['armR', 'hilt', [1, 1, 1], [-3.8, 9.8, -0.8]],
    ['armR', 'hilt', [0.8, 0.8, 1.6], [-3.8, 9.8, 0.6]],
    ['armR', 'hilt', [3, 0.8, 0.8], [-3.8, 9.8, 1.8]],
    ['armR', 'blade', [0.6, 1.6, 9], [-3.8, 9.8, 6.8]],
    ['armR', 'rust', [0.7, 0.8, 1.6], [-3.8, 10.2, 5]],
    ['armR', 'rust', [0.7, 0.6, 1.2], [-3.8, 9.4, 8.8]],
  ],
  hitboxBones: ['body', 'head', 'legL', 'legR'],
  anim: { gait: 'biped', stride: 2, swing: 0.55, hunch: 0, rattle: true, weaponRest: -0.6 },
};

const SHADOW = {
  unit: 0.1,
  colors: {
    shell: '#2a1838', shellLight: '#3f2752', shadow: '#160c20', claw: '#0e0814',
    vein: '#8a3fd0', eye: '#ff3cf0', eyeSmall: '#ffb0f8', wisp: '#3a1d55', wispTip: '#b45cff',
  },
  bones: {
    body: { pivot: [0, 8, 0] },
    head: { pivot: [0, 8, 5], parent: 'body' },
    tail: { pivot: [0, 11, -5], parent: 'body' },
    legFL: { pivot: [4, 8, 4.5] },
    legFR: { pivot: [-4, 8, 4.5] },
    legML: { pivot: [4.4, 8, 0] },
    legMR: { pivot: [-4.4, 8, 0] },
    legBL: { pivot: [4, 8, -4.5] },
    legBR: { pivot: [-4, 8, -4.5] },
  },
  parts: [
    // Hunched carapace with glowing veins
    ['body', 'shell', [8, 5, 10], [0, 8.5, 0]],
    ['body', 'shell', [7, 4.4, 6], [0, 9, -7]],
    ['body', 'shadow', [7, 0.6, 9], [0, 5.8, 0]],
    ['body', 'shellLight', [1, 1.4, 1], [0, 11.6, 3]],
    ['body', 'shellLight', [1, 1.6, 1], [0, 11.7, 0]],
    ['body', 'shellLight', [1, 1.4, 1], [0, 11.6, -3]],
    ...sym('body', 'vein', [0.3, 0.3, 8], [2, 11.05, 0], { glow: true }),
    ...sym('body', 'vein', [0.3, 0.3, 4.4], [1.6, 11.25, -7], { glow: true }),
    ...sym('body', 'vein', [0.3, 2.4, 0.3], [4.05, 9.4, 2], { glow: true }),
    // Head: mandibles and a cluster of eyes
    ['head', 'shell', [6, 4, 4], [0, 8.4, 7]],
    ['head', 'shadow', [5, 1.4, 3], [0, 6.2, 7.6]],
    ...sym('head', 'claw', [1, 1, 3.4], [1.8, 6.4, 10]),
    ...sym('head', 'claw', [1, 1.6, 1], [1.4, 6.2, 11.4]),
    ...sym('head', 'eye', [1.2, 1.2, 0.3], [1.4, 9.2, 9.05], { glow: true }),
    ...sym('head', 'eyeSmall', [0.6, 0.6, 0.3], [2.6, 10, 9.05], { glow: true }),
    ...sym('head', 'eyeSmall', [0.6, 0.6, 0.3], [0.6, 10.4, 9.05], { glow: true }),
    // Six spindly legs: up to a high knee, then down to a claw
    ...[['FL', 4.5], ['ML', 0], ['BL', -4.5]].flatMap(([leg, z]) => {
      const x = leg === 'ML' ? 4.4 : 4;
      return pair(`leg${leg[0]}`, 'shell', [5, 1.2, 1.2], [x + 2.5, 9.6, z])
        .concat(pair(`leg${leg[0]}`, 'shellLight', [1.6, 1.6, 1.6], [x + 5, 9.6, z]))
        .concat(pair(`leg${leg[0]}`, 'shadow', [1, 8, 1], [x + 5.2, 5, z]))
        .concat(pair(`leg${leg[0]}`, 'claw', [1, 1.2, 1.6], [x + 5.2, 0.6, z + 0.3]));
    }),
    // Smoky tendrils rising off the back
    ['tail', 'wisp', [1, 5, 1], [1.5, 13.4, -6]],
    ['tail', 'wisp', [1, 6, 1], [0, 14, -7.6]],
    ['tail', 'wisp', [1, 4, 1], [-1.6, 12.8, -8.6]],
    ['tail', 'wispTip', [1.2, 1.2, 1.2], [1.5, 16.4, -6], { glow: true }],
    ['tail', 'wispTip', [1.2, 1.2, 1.2], [0, 17.6, -7.6], { glow: true }],
    ['tail', 'wispTip', [1.2, 1.2, 1.2], [-1.6, 15.4, -8.6], { glow: true }],
  ],
  hitboxBones: ['body', 'head'],
  anim: { gait: 'crawl', stride: 2.2, swing: 0.45 },
};

export const ENEMY_MODELS = { slime: SLIME, goblin: GOBLIN, skeleton: SKELETON, shadow: SHADOW };

/** The model for a monster type (unknown types fall back to the slime). */
export function getEnemyModel(type) {
  return ENEMY_MODELS[type] || SLIME;
}

/** Full height of a monster, for placing damage numbers above it. */
export function getEnemyHeight(type) {
  return getModelBounds(getEnemyModel(type)).max[1];
}

/** Physics box around the core body (no weapons, legs splayed wide, or tendrils). */
export function getEnemyColliderBox(type) {
  const model = getEnemyModel(type);
  return getRigColliderBox(model, (bone) => model.hitboxBones.includes(bone));
}

const cachedGeometry = createGeometryCache();

/** A posable monster with its own skeleton over cached, shared geometry. */
export function createEnemyInstance(type, { tint = 1 } = {}) {
  const model = getEnemyModel(type);
  const key = ENEMY_MODELS[type] ? type : 'slime';
  const geometries = cachedGeometry(key, () => buildRigGeometry(model));
  // Slimes are glossy; everything else is matte
  return createRig(model, geometries, { tint, roughness: model === SLIME ? 0.35 : 0.9 });
}
