/**
 * animalModels.js — Voxel models for the ambient wildlife.
 *
 * Each species is a list of colored boxes, each attached to a bone of a small
 * skeleton (body, head, tail, four legs, two wings). The boxes are merged into
 * one skinned geometry per species (cached), so every animal is a single draw
 * call while its legs, head, tail and wings still animate (animalAnimation.js).
 *
 * The model format (facing +Z, feet on Y = 0, left side +X) and the geometry
 * builder are shared with the enemies: see ../voxelRig.js. Every species uses
 * the same bone list (BONE_NAMES) so one pose function drives them all.
 */

import {
  pair,
  sym,
  hash01,
  hashString,
  getModelParts,
  getModelBounds,
  getColliderBox as getRigColliderBox,
  buildRigGeometry,
  createGeometryCache,
  createRig,
} from '../voxelRig';

export { getModelParts, getModelBounds };

/** Four leg bones: front legs at (±fx, hipY, fz), back legs at (±bx, hipY, bz). */
function legBones(hipY, fx, fz, bx = fx, bz = -fz) {
  return {
    legFL: { pivot: [fx, hipY, fz] },
    legFR: { pivot: [-fx, hipY, fz] },
    legBL: { pivot: [bx, hipY, bz] },
    legBR: { pivot: [-bx, hipY, bz] },
  };
}

/** Both wing bones, hinged at (±x, y, z) on the body. */
function wingBones(x, y, z) {
  return {
    wingL: { pivot: [x, y, z], parent: 'body' },
    wingR: { pivot: [-x, y, z], parent: 'body' },
  };
}

// ── Species ──────────────────────────────────────────────────
// `anim` tunes animalAnimation.js: gait (walk | bound | waddle | fly),
// stride (world units per step cycle), legSwing (radians), bob (world units),
// idle (graze | sniff | look), tail (flick | wag | sway | still | flag).

const DEER = {
  unit: 0.09,
  colors: {
    coat: '#9a6b43', coatDark: '#7c5434', leg: '#b48a5e', belly: '#eadfc8',
    white: '#f4f1e8', hoof: '#2f241b', nose: '#241a14', eye: '#120e0c',
    earIn: '#c99f80', antler: '#dccaa2',
  },
  bones: {
    body: { pivot: [0, 14, 0] },
    head: { pivot: [0, 16, 7], parent: 'body' },
    tail: { pivot: [0, 16.5, -8], parent: 'body' },
    ...legBones(11, 2.4, 6, 2.4, -6),
  },
  parts: [
    // Legs: thigh, slim shank, dark hoof
    ...pair('legF', 'coat', [2.4, 5, 2.6], [2.4, 8.5, 6]),
    ...pair('legF', 'leg', [1.6, 6.5, 1.6], [2.4, 3.25, 6.1]),
    ...pair('legF', 'hoof', [1.8, 1.2, 2], [2.4, 0.6, 6.3]),
    ...pair('legB', 'coat', [3, 6, 4], [2.4, 8.5, -6]),
    ...pair('legB', 'leg', [1.6, 6, 1.6], [2.4, 3, -6.6]),
    ...pair('legB', 'hoof', [1.8, 1.2, 2], [2.4, 0.6, -6.4]),
    // Body
    ['body', 'coat', [6, 7, 16], [0, 14, 0]],
    ['body', 'coatDark', [5, 0.8, 13], [0, 17.8, -0.5]],
    ['body', 'belly', [5, 1, 12], [0, 10.4, 0]],
    ['body', 'white', [5, 4.4, 0.6], [0, 14.8, -8.2]], // white rump
    // Neck and head
    ['head', 'coat', [3.4, 4, 3.4], [0, 17.5, 7.6]],
    ['head', 'coat', [3, 4, 3], [0, 20.5, 8.8]],
    ['head', 'belly', [2.4, 2.4, 0.4], [0, 19.6, 10.35]], // pale throat
    ['head', 'coat', [3.6, 3.6, 4.4], [0, 23, 10]],
    ['head', 'leg', [2.6, 2.4, 3], [0, 22.4, 13.2]],
    ['head', 'belly', [2.4, 0.8, 2.8], [0, 21, 13.2]],
    ['head', 'nose', [1.6, 1.2, 0.6], [0, 22.9, 14.9]],
    ...sym('head', 'eye', [0.5, 0.9, 0.9], [1.85, 23.6, 11.2]),
    ...sym('head', 'coat', [2.6, 1.4, 0.7], [2.6, 25, 9.2]),
    ...sym('head', 'earIn', [2, 0.8, 0.2], [2.6, 25, 9.6]),
    // Antlers (bucks)
    ...sym('head', 'antler', [0.6, 4, 0.6], [1.2, 26.6, 9.4], { variant: 'antlers' }),
    ...sym('head', 'antler', [0.6, 0.6, 2.2], [1.2, 27.4, 10.6], { variant: 'antlers' }),
    ...sym('head', 'antler', [2.4, 0.6, 0.6], [2.2, 28.4, 9.4], { variant: 'antlers' }),
    ...sym('head', 'antler', [0.6, 2.4, 0.6], [3.1, 29.4, 9.4], { variant: 'antlers' }),
    ...sym('head', 'antler', [0.6, 1.6, 0.6], [1.6, 29.4, 9.4], { variant: 'antlers' }),
    // Tail: brown on top, white underneath
    ['tail', 'white', [1.8, 3, 1], [0, 15.4, -8.6]],
    ['tail', 'coat', [1.8, 1.2, 1.1], [0, 16.8, -8.6]],
  ],
  variants: ['antlers', null],
  anim: { gait: 'walk', stride: 2.4, legSwing: 0.55, bob: 0.06, idle: 'graze', tail: 'flag' },
};

const RACCOON = {
  unit: 0.055,
  colors: {
    fur: '#7f7b76', furDark: '#625e5a', light: '#cdc7bd', mask: '#262322',
    white: '#efebe3', nose: '#141212', paw: '#2e2a28',
  },
  bones: {
    body: { pivot: [0, 6.5, 0] },
    head: { pivot: [0, 8, 6], parent: 'body' },
    tail: { pivot: [0, 7.5, -6], parent: 'body' },
    ...legBones(4.5, 2.6, 4.5),
  },
  parts: [
    ...pair('legF', 'furDark', [2.2, 3.6, 2.2], [2.6, 2.7, 4.5]),
    ...pair('legF', 'paw', [2.4, 1, 2.8], [2.6, 0.5, 4.8]),
    ...pair('legB', 'furDark', [2.6, 3.6, 2.8], [2.6, 2.7, -4.5]),
    ...pair('legB', 'paw', [2.4, 1, 2.8], [2.6, 0.5, -4.2]),
    // Chunky, arched body
    ['body', 'fur', [7, 5.6, 12], [0, 6.6, 0]],
    ['body', 'furDark', [6, 1.6, 7], [0, 10.2, -1.5]],
    ['body', 'light', [6, 0.6, 8], [0, 3.7, 0.5]],
    // Head with the bandit mask
    ['head', 'fur', [6, 4.6, 4.6], [0, 8.6, 8]],
    ['head', 'light', [3, 2.4, 2.6], [0, 7.6, 11.4]],
    ['head', 'nose', [1.2, 1, 0.6], [0, 8.4, 12.9]],
    ['head', 'mask', [6.2, 1.8, 0.6], [0, 9, 10.4]],
    ['head', 'mask', [1, 2.2, 0.6], [0, 10.1, 10.4]],
    ['head', 'white', [6.2, 0.8, 0.6], [0, 10.3, 10.36]],
    ...sym('head', 'white', [1.6, 1.4, 0.6], [2.2, 7.4, 10.36]),
    ...sym('head', 'nose', [0.7, 0.7, 0.2], [1.5, 9.1, 10.8]),
    ...sym('head', 'fur', [1.6, 1.8, 0.8], [2.2, 11.6, 7.4]),
    ...sym('head', 'white', [1.7, 0.5, 0.9], [2.2, 12.5, 7.4]),
    // Ringed tail
    ['tail', 'fur', [3, 3, 2.2], [0, 7.4, -7.1]],
    ['tail', 'mask', [3.1, 3.1, 1.6], [0, 7.1, -9]],
    ['tail', 'fur', [3, 3, 2], [0, 6.8, -10.8]],
    ['tail', 'mask', [3.1, 3.1, 1.6], [0, 6.5, -12.6]],
    ['tail', 'fur', [2.8, 2.8, 2], [0, 6.2, -14.4]],
    ['tail', 'mask', [2.6, 2.6, 1.6], [0, 5.9, -16.2]],
  ],
  anim: { gait: 'waddle', stride: 0.9, legSwing: 0.6, bob: 0.03, idle: 'sniff', tail: 'sway' },
};

const BEAVER = {
  unit: 0.06,
  colors: {
    fur: '#6e4a2e', furDark: '#4c3220', belly: '#8d6648', tail: '#2f2a28',
    tailLine: '#45403b', teeth: '#e8a33a', nose: '#1d1816', eye: '#0e0b0a',
  },
  bones: {
    body: { pivot: [0, 6, 0] },
    head: { pivot: [0, 7, 6], parent: 'body' },
    tail: { pivot: [0, 4.5, -6], parent: 'body' },
    ...legBones(3.2, 3.2, 4, 3.2, -4),
  },
  parts: [
    ...pair('legF', 'furDark', [2.2, 3.2, 2.4], [3.2, 1.6, 4]),
    ...pair('legB', 'furDark', [2.8, 3.2, 2.8], [3.2, 1.6, -4]),
    ...pair('legB', 'tail', [3, 0.8, 4.2], [3.2, 0.4, -3.4]), // webbed feet
    // Round body
    ['body', 'fur', [8, 7, 12], [0, 6.3, 0]],
    ['body', 'fur', [6.4, 1.6, 10], [0, 10.6, -0.4]],
    ['body', 'fur', [6.6, 5.4, 1.4], [0, 6.3, -6.6]],
    ['body', 'belly', [7, 0.6, 9], [0, 2.9, 0.5]],
    // Head, buck teeth
    ['head', 'fur', [6, 5.4, 5], [0, 7.6, 8.4]],
    ['head', 'belly', [4, 3, 2], [0, 6.4, 11.6]],
    ['head', 'nose', [2, 1, 0.6], [0, 7.8, 12.7]],
    ['head', 'teeth', [1.6, 1.6, 0.6], [0, 4.6, 12.3]],
    ...sym('head', 'furDark', [1.2, 1.2, 1], [3, 10.4, 7.6]),
    ...sym('head', 'eye', [0.4, 0.8, 0.8], [3.05, 8.6, 9.6]),
    // Flat, cross-hatched paddle tail
    ['tail', 'furDark', [3, 2, 2], [0, 4.2, -6.8]],
    ['tail', 'tail', [6, 1, 9], [0, 3.4, -11.4]],
    ['tail', 'tailLine', [6.1, 1.05, 0.5], [0, 3.4, -9.6]],
    ['tail', 'tailLine', [6.1, 1.05, 0.5], [0, 3.4, -12.6]],
    ['tail', 'tailLine', [0.5, 1.05, 9.1], [0, 3.4, -11.4]],
  ],
  anim: { gait: 'waddle', stride: 0.9, legSwing: 0.5, bob: 0.03, idle: 'graze', tail: 'still' },
};

const SKUNK = {
  unit: 0.055,
  colors: { fur: '#1c1c20', white: '#f1efea', nose: '#3a3a3e', glint: '#d8d8e0' },
  bones: {
    body: { pivot: [0, 6, 0] },
    head: { pivot: [0, 7, 5.5], parent: 'body' },
    tail: { pivot: [0, 8, -5.5], parent: 'body' },
    ...legBones(3.6, 2.4, 3.6),
  },
  parts: [
    ...pair('legF', 'fur', [2, 3.6, 2], [2.4, 1.8, 3.6]),
    ...pair('legB', 'fur', [2.4, 3.6, 2.6], [2.4, 1.8, -3.6]),
    ['body', 'fur', [6, 6, 11], [0, 6.2, 0]],
    ['body', 'fur', [5, 1.4, 7], [0, 9.8, -1]],
    // Twin back stripes
    ...sym('body', 'white', [1.2, 0.4, 10], [1.4, 9.35, 0.2]),
    ...sym('body', 'white', [1.2, 0.4, 7], [1.2, 10.7, -1]),
    // Head with the white blaze
    ['head', 'fur', [4.6, 4.4, 4.4], [0, 7.6, 7.6]],
    ['head', 'fur', [2.4, 2, 2.2], [0, 6.9, 10.6]],
    ['head', 'nose', [1, 0.8, 0.5], [0, 7.5, 11.8]],
    ['head', 'white', [1, 0.4, 4.4], [0, 10, 7.6]],
    ['head', 'white', [1, 2.4, 0.4], [0, 8.6, 9.95]],
    ...sym('head', 'glint', [0.6, 0.6, 0.3], [1.5, 8.4, 9.9]),
    ...sym('head', 'fur', [1.2, 1, 0.8], [1.6, 10.3, 6.6]),
    // Big plume held upright
    ['tail', 'fur', [3, 3, 3], [0, 9.4, -6.8]],
    ['tail', 'fur', [5, 8, 4], [0, 14, -8]],
    ['tail', 'white', [1.6, 8.2, 4.2], [0, 14, -8]],
    ['tail', 'fur', [4.4, 2.6, 4.4], [0, 19, -7.2]],
    ['tail', 'white', [3.2, 1.2, 3.2], [0, 20.6, -6.8]],
  ],
  anim: { gait: 'waddle', stride: 0.7, legSwing: 0.6, bob: 0.02, idle: 'sniff', tail: 'sway' },
};

const OPOSSUM = {
  unit: 0.055,
  colors: {
    fur: '#b7b4ad', furTop: '#8f8c86', furDark: '#504e4b', face: '#f3f0ea',
    ear: '#1f1e1d', pink: '#e7a4a8', eye: '#0c0b0b',
  },
  bones: {
    body: { pivot: [0, 6.5, 0] },
    head: { pivot: [0, 7.5, 5.5], parent: 'body' },
    tail: { pivot: [0, 6.5, -7], parent: 'body' },
    ...legBones(4, 2.5, 4),
  },
  parts: [
    ...pair('legF', 'furDark', [2, 3.4, 2], [2.5, 2.3, 4]),
    ...pair('legF', 'pink', [2.2, 0.8, 2.4], [2.5, 0.4, 4.3]),
    ...pair('legB', 'furDark', [2.4, 3.4, 2.4], [2.5, 2.3, -4]),
    ...pair('legB', 'pink', [2.2, 0.8, 2.4], [2.5, 0.4, -3.7]),
    ['body', 'fur', [6.4, 6, 13], [0, 6.6, -0.5]],
    ['body', 'furTop', [6.8, 1.2, 11], [0, 9.9, -1]],
    ['body', 'face', [5.4, 0.6, 9], [0, 3.6, 0]],
    // Pale, pointed face
    ['head', 'face', [4.6, 4.4, 4], [0, 7.8, 7.4]],
    ['head', 'face', [3, 2.6, 3], [0, 7, 10.6]],
    ['head', 'face', [2, 1.8, 2], [0, 6.8, 12.8]],
    ['head', 'pink', [1.2, 1, 0.6], [0, 7.1, 14]],
    ...sym('head', 'ear', [1.8, 2, 0.6], [1.9, 10.6, 6.8]),
    ...sym('head', 'eye', [0.4, 0.8, 0.8], [2.35, 8.4, 8.4]),
    // Long bare tail with a curled tip
    ['tail', 'furDark', [1.6, 1.6, 2], [0, 6.5, -7.6]],
    ['tail', 'pink', [1.2, 1.2, 3], [0, 6, -10]],
    ['tail', 'pink', [1, 1, 3], [0, 5.3, -12.9]],
    ['tail', 'pink', [0.8, 0.8, 3], [0, 4.8, -15.8]],
    ['tail', 'pink', [0.8, 1.8, 0.8], [0, 5.6, -17.2]],
  ],
  anim: { gait: 'walk', stride: 0.8, legSwing: 0.55, bob: 0.02, idle: 'sniff', tail: 'sway' },
};

const MOLE = {
  unit: 0.04,
  colors: { fur: '#2d2a2e', furLight: '#3d3a3f', hand: '#e9a7a0', snout: '#e48f95' },
  bones: {
    body: { pivot: [0, 4, 0] },
    head: { pivot: [0, 4.2, 5.5], parent: 'body' },
    tail: { pivot: [0, 4.5, -6], parent: 'body' },
    ...legBones(2.6, 3.4, 3.5, 2.6, -4),
  },
  parts: [
    // Big, sideways digging hands
    ...pair('legF', 'fur', [2, 2, 2], [3.4, 1.8, 3.5]),
    ...pair('legF', 'hand', [3, 0.8, 3.2], [4.4, 0.4, 3.8]),
    ...pair('legB', 'hand', [1.6, 1.2, 2.4], [2.6, 0.6, -3.8]),
    ['body', 'fur', [7, 5.6, 12], [0, 4.2, 0]],
    ['body', 'furLight', [5.6, 1.2, 10], [0, 7.6, 0]],
    ['body', 'fur', [5.6, 4.4, 1.4], [0, 4.2, -6.4]],
    ['head', 'fur', [5, 4.4, 3], [0, 4.2, 7]],
    ['head', 'snout', [2, 1.6, 3.6], [0, 3.8, 10.2]],
    ['head', 'hand', [1.6, 1.4, 0.6], [0, 3.9, 12.2]],
    ['tail', 'snout', [0.9, 0.9, 2], [0, 4.6, -7.4]],
  ],
  anim: { gait: 'waddle', stride: 0.4, legSwing: 0.7, bob: 0.02, idle: 'sniff', tail: 'still' },
};

const BEAR = {
  unit: 0.1,
  colors: {
    fur: '#5b3a22', furDark: '#43291a', muzzle: '#a07a55', nose: '#16100d',
    claw: '#d8cfbd', eye: '#0d0907', earIn: '#2e1c11',
  },
  bones: {
    body: { pivot: [0, 12, 0] },
    head: { pivot: [0, 14, 10], parent: 'body' },
    tail: { pivot: [0, 15, -12], parent: 'body' },
    ...legBones(9, 3.4, 7, 3.4, -7.4),
  },
  parts: [
    ...pair('legF', 'fur', [4, 8.4, 4.2], [3.4, 5, 7]),
    ...pair('legF', 'furDark', [4.4, 1.4, 5], [3.4, 0.7, 7.5]),
    ...pair('legF', 'claw', [3.6, 0.6, 0.6], [3.4, 0.3, 10.2]),
    ...pair('legB', 'fur', [5, 5, 6], [3.4, 7.2, -7.4]),
    ...pair('legB', 'fur', [4, 5, 4], [3.4, 2.8, -7.8]),
    ...pair('legB', 'furDark', [4.4, 1.4, 5], [3.4, 0.7, -7.2]),
    // Heavy body with a shoulder hump
    ['body', 'fur', [10, 9, 20], [0, 12.5, 0]],
    ['body', 'fur', [8, 2.4, 7], [0, 18, 5]],
    ['body', 'fur', [9.4, 8.4, 3], [0, 12.6, -11]],
    ['body', 'furDark', [9, 0.8, 14], [0, 7.9, 0]],
    // Head
    ['head', 'fur', [7, 7, 4], [0, 14, 11.5]],
    ['head', 'fur', [7.4, 6.6, 6], [0, 14.6, 15.6]],
    ['head', 'muzzle', [4, 3.2, 3.4], [0, 13, 20.2]],
    ['head', 'nose', [2, 1.4, 0.8], [0, 14.2, 22]],
    ...sym('head', 'fur', [2.2, 2.2, 1.4], [2.8, 18.6, 14.4]),
    ...sym('head', 'earIn', [1.4, 1.4, 0.2], [2.8, 18.5, 15.2]),
    ...sym('head', 'eye', [0.8, 0.8, 0.4], [2.2, 15.8, 18.7]),
    ['tail', 'fur', [2, 2, 1.6], [0, 15, -12.8]],
  ],
  anim: { gait: 'walk', stride: 3, legSwing: 0.45, bob: 0.08, idle: 'look', tail: 'still' },
};

const WOLF = {
  unit: 0.085,
  colors: {
    fur: '#8e8e93', saddle: '#5a5a60', light: '#dcdad4', nose: '#18181a',
    eye: '#e0a63a', earTip: '#3e3e44',
  },
  bones: {
    body: { pivot: [0, 13, 0] },
    head: { pivot: [0, 15, 9], parent: 'body' },
    tail: { pivot: [0, 15, -9], parent: 'body' },
    ...legBones(10, 2.4, 6.5, 2.4, -6.8),
  },
  parts: [
    ...pair('legF', 'fur', [2.6, 5, 2.6], [2.4, 7.5, 6.5]),
    ...pair('legF', 'light', [2, 5, 2], [2.4, 2.5, 6.6]),
    ...pair('legF', 'light', [2.4, 1, 3], [2.4, 0.5, 7]),
    ...pair('legB', 'fur', [3, 5, 4], [2.4, 7.6, -6.8]),
    ...pair('legB', 'light', [2, 6, 2], [2.4, 3, -7.4]),
    ...pair('legB', 'light', [2.4, 1, 3], [2.4, 0.5, -7]),
    // Lean body, deep chest, dark saddle
    ['body', 'fur', [6, 7, 18], [0, 13, 0]],
    ['body', 'fur', [6.2, 9, 7], [0, 12.6, 5.4]],
    ['body', 'light', [5, 6, 0.6], [0, 12, 9.1]],
    ['body', 'saddle', [6.4, 1.6, 12], [0, 16.6, -1.5]],
    ['body', 'light', [7, 3.6, 3], [0, 15.2, 7.4]],
    ['body', 'light', [5, 0.6, 12], [0, 9.3, -1]],
    // Head: pointed ears, long muzzle, amber eyes
    ['head', 'fur', [5.4, 5, 5], [0, 17, 11.5]],
    ['head', 'light', [6, 2.2, 3], [0, 15.4, 11.6]],
    ['head', 'fur', [3, 2.4, 4.4], [0, 16.2, 15.5]],
    ['head', 'light', [2.8, 1.2, 4.2], [0, 14.6, 15.4]],
    ['head', 'nose', [1.4, 1.2, 0.6], [0, 17, 17.9]],
    ...sym('head', 'fur', [1.6, 3, 1.2], [1.8, 20.6, 10.6]),
    ...sym('head', 'earTip', [1.2, 1, 1.3], [1.8, 21.8, 10.6]),
    ...sym('head', 'eye', [0.8, 0.6, 0.4], [1.5, 18, 14.1]),
    // Bushy tail hanging back and down
    ['tail', 'fur', [2.4, 2.4, 3], [0, 14.6, -10.6]],
    ['tail', 'fur', [2.8, 2.8, 3], [0, 13.2, -12.8]],
    ['tail', 'saddle', [2.6, 3, 2.6], [0, 11.4, -14.4]],
    ['tail', 'earTip', [2.2, 1.4, 2.2], [0, 9.6, -14.6]],
  ],
  anim: { gait: 'walk', stride: 2.6, legSwing: 0.55, bob: 0.05, idle: 'look', tail: 'wag' },
};

const PUMA = {
  unit: 0.085,
  colors: {
    fur: '#c49a62', light: '#ecdcc0', dark: '#4a3526', nose: '#b07a66', eye: '#d9b84a',
  },
  bones: {
    body: { pivot: [0, 11.5, 0] },
    head: { pivot: [0, 13.5, 9.5], parent: 'body' },
    tail: { pivot: [0, 14, -10], parent: 'body' },
    ...legBones(9, 2.6, 7, 2.6, -7.2),
  },
  parts: [
    ...pair('legF', 'fur', [2.6, 8.4, 2.6], [2.6, 4.8, 7]),
    ...pair('legF', 'light', [3, 1.2, 3.4], [2.6, 0.6, 7.4]),
    ...pair('legB', 'fur', [3.4, 6, 5], [2.6, 6.8, -7.2]),
    ...pair('legB', 'fur', [2.4, 4.4, 2.4], [2.6, 2.6, -8]),
    ...pair('legB', 'light', [3, 1.2, 3.4], [2.6, 0.6, -7.6]),
    // Long, low body
    ['body', 'fur', [6.4, 6.4, 20], [0, 11.8, 0]],
    ['body', 'fur', [6.8, 1.4, 5], [0, 15.6, 6]],
    ['body', 'light', [5.6, 0.6, 14], [0, 8.4, 0.5]],
    // Small round head
    ['head', 'fur', [4.6, 5, 3], [0, 14, 11]],
    ['head', 'fur', [5.6, 4.6, 4.6], [0, 15.6, 13.4]],
    ['head', 'light', [3.6, 2.4, 2], [0, 14.2, 16.4]],
    ['head', 'light', [3, 1.4, 3.4], [0, 13, 14.8]],
    ['head', 'nose', [1.4, 1, 0.6], [0, 15.2, 17.5]],
    ...sym('head', 'fur', [1.6, 1.6, 1], [1.9, 18.6, 12.6]),
    ...sym('head', 'dark', [1.6, 1.6, 0.4], [1.9, 18.6, 11.9]),
    ...sym('head', 'eye', [0.8, 0.6, 0.4], [1.6, 16.4, 15.8]),
    // Long tail dropping to an upturned dark tip
    ['tail', 'fur', [2, 2, 5], [0, 13.4, -12.4]],
    ['tail', 'fur', [2, 3, 4], [0, 11.4, -16.2]],
    ['tail', 'fur', [2, 2.4, 3.4], [0, 9.6, -19.4]],
    ['tail', 'dark', [2.2, 3.4, 2.2], [0, 10.8, -21.6]],
  ],
  anim: { gait: 'bound', stride: 3.2, legSwing: 0.6, bob: 0.05, idle: 'look', tail: 'sway' },
};

const BAT = {
  unit: 0.045,
  colors: { fur: '#3a2f33', wing: '#56444b', bone: '#2a2124', eye: '#d9c06a', earIn: '#7a5a60' },
  bones: {
    body: { pivot: [0, 3, 0] },
    head: { pivot: [0, 3.4, 3], parent: 'body' },
    tail: { pivot: [0, 3, -3], parent: 'body' },
    ...wingBones(1.8, 3.6, 0.5),
  },
  parts: [
    ['body', 'fur', [3.6, 3.6, 6], [0, 3, 0]],
    ['head', 'fur', [3, 3, 2.6], [0, 3.6, 4.2]],
    ['head', 'fur', [1.4, 1.2, 1], [0, 3.2, 6]],
    ...sym('head', 'fur', [0.8, 2.4, 0.6], [1, 6, 4]),
    ...sym('head', 'earIn', [0.5, 1.8, 0.2], [1, 6, 4.35]),
    ...sym('head', 'eye', [0.5, 0.5, 0.3], [0.9, 4, 5.55]),
    // Membrane wings with dark finger bones and a scalloped trailing edge
    ...pair('wing', 'bone', [6, 0.6, 0.6], [4.8, 3.8, 1.4]),
    ...pair('wing', 'wing', [6, 0.3, 5.6], [4.8, 3.6, -1.4]),
    ...pair('wing', 'wing', [6, 0.3, 4], [10.8, 3.6, -0.2]),
    ...pair('wing', 'bone', [6, 0.4, 0.5], [10.8, 3.7, 1.6]),
    ...pair('wing', 'bone', [0.5, 0.4, 4.4], [8, 3.7, -0.6]),
    ...pair('wing', 'bone', [0.5, 0.4, 3.4], [13.6, 3.7, 0]),
    ['tail', 'wing', [3, 0.3, 2.4], [0, 2.6, -4]],
  ],
  anim: { gait: 'fly', flapRate: 7, flapAmp: 0.85, glide: false, idle: 'sniff', tail: 'still' },
};

const CROW = {
  unit: 0.045,
  colors: { feather: '#17171b', sheen: '#262b38', beak: '#2e2e32', eye: '#c8c8d0', foot: '#2b2b2b' },
  bones: {
    body: { pivot: [0, 4, 0] },
    head: { pivot: [0, 5, 4], parent: 'body' },
    tail: { pivot: [0, 4.4, -4], parent: 'body' },
    ...wingBones(2.2, 5, 1),
  },
  parts: [
    ['body', 'feather', [4.4, 4.4, 8], [0, 4, 0]],
    ['body', 'sheen', [3.8, 0.6, 6], [0, 6.3, -0.4]],
    ...sym('body', 'foot', [0.6, 1.6, 0.6], [1, 1.2, 0.6]),
    ['head', 'feather', [3.6, 3.6, 3.6], [0, 5.8, 5.8]],
    ['head', 'beak', [1.4, 1.4, 3], [0, 5.4, 8.8]],
    ['head', 'beak', [1, 0.8, 1], [0, 4.9, 10.4]],
    ...sym('head', 'eye', [0.4, 0.6, 0.6], [1.85, 6.4, 6.8]),
    // Wedge tail
    ['tail', 'feather', [3.6, 0.8, 5], [0, 4.6, -6.4]],
    ['tail', 'sheen', [4.6, 0.8, 2], [0, 4.6, -9.4]],
    // Wings: coverts, secondaries and three fingered primaries
    ...pair('wing', 'sheen', [6, 0.8, 4], [5.2, 5, 1.2]),
    ...pair('wing', 'feather', [6, 0.6, 3.4], [5.2, 4.9, -2.4]),
    ...pair('wing', 'feather', [5, 0.6, 1.2], [10.6, 5, 2.4]),
    ...pair('wing', 'feather', [5.8, 0.6, 1.2], [11, 5, 0.6]),
    ...pair('wing', 'feather', [5, 0.6, 1.2], [10.6, 5, -1.2]),
  ],
  anim: { gait: 'fly', flapRate: 3.2, flapAmp: 0.7, glide: true, idle: 'look', tail: 'still' },
};

const SQUIRREL = {
  unit: 0.045,
  colors: {
    fur: '#a8603a', furDark: '#8a4c2c', cream: '#efe2c8', dark: '#2a1f19',
    tail: '#b8703f', tailTip: '#d8a374',
  },
  bones: {
    body: { pivot: [0, 6, 0] },
    head: { pivot: [0, 8, 4], parent: 'body' },
    tail: { pivot: [0, 6, -4.5], parent: 'body' },
    ...legBones(4.5, 1.8, 3.6, 2, -2.6),
  },
  parts: [
    ...pair('legF', 'furDark', [1.6, 4.4, 1.6], [1.8, 2.3, 3.8]),
    ...pair('legB', 'fur', [2.6, 4, 5], [2, 3, -2.6]),
    ...pair('legB', 'furDark', [2, 0.8, 4], [2, 0.4, -1.4]),
    ['body', 'fur', [5, 5.6, 9], [0, 6.4, 0]],
    ['body', 'fur', [4.4, 4, 3], [0, 8, 3.4]],
    ['body', 'cream', [4, 4.4, 0.6], [0, 6.4, 4.6]],
    ['body', 'cream', [4, 0.6, 7], [0, 3.6, 0.4]],
    ['head', 'fur', [4, 4, 4], [0, 9.6, 5.8]],
    ['head', 'fur', [2.4, 2, 1.6], [0, 9, 8.4]],
    ['head', 'cream', [2.4, 0.8, 1.6], [0, 8, 8.2]],
    ['head', 'dark', [0.8, 0.6, 0.4], [0, 9.5, 9.25]],
    ...sym('head', 'dark', [0.4, 0.9, 0.9], [2.05, 10.2, 6.8]),
    ...sym('head', 'cream', [0.3, 1.4, 1.4], [2.05, 10.2, 6.6]),
    ...sym('head', 'fur', [1, 1.8, 0.8], [1.3, 12.4, 5.2]),
    ...sym('head', 'dark', [0.6, 0.8, 0.6], [1.3, 13.6, 5.2]),
    // Big bushy S-curved tail
    ['tail', 'tail', [3.6, 3.6, 3], [0, 6, -6.2]],
    ['tail', 'tail', [4.4, 6, 4], [0, 9.6, -8.2]],
    ['tail', 'tail', [4.8, 5, 4.6], [0, 14.2, -7.4]],
    ['tail', 'tailTip', [4, 3, 4], [0, 17.6, -5.6]],
  ],
  anim: { gait: 'bound', stride: 1.1, legSwing: 0.7, bob: 0.05, idle: 'sniff', tail: 'flick' },
};

export const ANIMAL_MODELS = {
  DEER, RACCOON, BEAVER, SKUNK, OPOSSUM, MOLE, BEAR, WOLF, PUMA, BAT, CROW, SQUIRREL,
};

/** Bone order shared by every species (the skin index of each bone). */
export const BONE_NAMES = [
  'body', 'head', 'tail', 'legFL', 'legFR', 'legBL', 'legBR', 'wingL', 'wingR',
];

// ── Geometry and instances ───────────────────────────────────

/**
 * Physics box: the body, legs and head, leaving out wings and tails so they
 * don't snag on terrain.
 */
export function getColliderBox(model) {
  return getRigColliderBox(model, (bone) => !bone.startsWith('wing') && bone !== 'tail');
}

/** Merge a species' boxes into one skinned geometry. */
export function buildAnimalGeometry(model, variant = null) {
  return buildRigGeometry(model, { variant, boneNames: BONE_NAMES }).geometry;
}

const cachedGeometry = createGeometryCache();

/** Cached geometry for a species and variant (shared by every instance). */
export function getAnimalGeometry(type, variant = null) {
  const model = ANIMAL_MODELS[type];
  if (!model) return null;
  return cachedGeometry(`${type}:${variant || ''}`, () => buildAnimalGeometry(model, variant));
}

/**
 * A posable animal: a SkinnedMesh with its own skeleton. `bones` maps bone
 * names to THREE.Bone; `rest` holds each bone's rest position for animation.
 */
export function createAnimalInstance(type, { variant = null, tint = 1 } = {}) {
  const model = ANIMAL_MODELS[type];
  const geometry = getAnimalGeometry(type, variant);
  if (!model || !geometry) return null;
  return createRig(model, { geometry, glowGeometry: null }, { boneNames: BONE_NAMES, tint });
}

/** Deterministic per-animal traits from its id: size, shade and variant. */
export function getAnimalTraits(id, type) {
  const h = hashString(id);
  const r1 = hash01(h, 1);
  const r2 = hash01(h, 2);
  const r3 = hash01(h, 3);
  const variants = ANIMAL_MODELS[type]?.variants;
  return {
    scale: 0.9 + r1 * 0.2,
    tint: 0.9 + r2 * 0.14,
    variant: variants ? variants[Math.floor(r3 * variants.length)] : null,
    seed: r3,
  };
}
