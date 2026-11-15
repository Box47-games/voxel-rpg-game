/**
 * humanoidModel.js — Voxel people: the player and the settlers.
 *
 * buildHumanoidModel(look) turns a "look" (skin, hair, clothes, hat, extras)
 * into a voxelRig model. Every humanoid shares one skeleton layout so one
 * animation module (humanoidAnimation.js) drives them all. Tools in the right
 * hand (sword, pickaxe, hammer, hoe) and a carried crate each hang on their
 * own bone and are shown or hidden by scaling that bone, so a character stays
 * a single draw call whatever it is holding.
 *
 * Model space (before `unit` scaling): faces +Z, feet on Y = 0, left is +X.
 */

import * as THREE from 'three';
import { pair, sym, hashString, hash01, buildRigGeometry, createGeometryCache, createRig } from '../voxelRig';

export const HUMANOID_BONES = [
  'body', 'head', 'armL', 'armR', 'legL', 'legR', 'cape',
  'toolSword', 'toolPick', 'toolHammer', 'toolHoe', 'carry',
];

/** Tool bones, all hidden unless an animation shows one. */
export const TOOL_BONES = ['toolSword', 'toolPick', 'toolHammer', 'toolHoe', 'carry'];

const HAND = [-4.6, 9.8, 0.6]; // right hand, where every tool is gripped

const BONES = {
  body: { pivot: [0, 11, 0] },
  head: { pivot: [0, 19.5, 0], parent: 'body' },
  armL: { pivot: [4.6, 18.4, 0], parent: 'body' },
  armR: { pivot: [-4.6, 18.4, 0], parent: 'body' },
  legL: { pivot: [1.6, 11, 0] },
  legR: { pivot: [-1.6, 11, 0] },
  cape: { pivot: [0, 19, -2.2], parent: 'body' },
  toolSword: { pivot: HAND, parent: 'armR' },
  toolPick: { pivot: HAND, parent: 'armR' },
  toolHammer: { pivot: HAND, parent: 'armR' },
  toolHoe: { pivot: HAND, parent: 'armR' },
  carry: { pivot: [0, 13, 4], parent: 'body' },
};

/** Darken (k < 1) or lighten (k > 1) a hex color. */
export function shade(hex, k) {
  const c = new THREE.Color(hex);
  const hsl = {};
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.max(0, Math.min(1, hsl.l * k)));
  return `#${c.getHexString()}`;
}

/** sRGB [r, g, b] (0-1) → '#rrggbb'. */
export function rgbToHex([r, g, b]) {
  const to = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255).toString(16).padStart(2, '0');
  return `#${to(r)}${to(g)}${to(b)}`;
}

/** The player: a blue-tunic adventurer with a red cape, satchel and a sword at the hip. */
export const PLAYER_LOOK = {
  skin: '#f0c39a',
  hair: '#6b4226',
  hairStyle: 'swept',
  eye: '#2a3a5a',
  shirt: '#3f6fd8',
  trim: '#e2b955',
  pants: '#4a3b2f',
  boots: '#3a2a1e',
  belt: '#5b3a22',
  gloves: '#5a4232',
  cape: '#a8342e',
  satchel: true,
  sheathedSword: true,
  hat: null,
  beard: false,
  apron: null,
};

// Settler outfits by preferred job
const JOB_GEAR = {
  farmer: { hat: 'straw', apron: null, satchel: false },
  miner: { hat: 'miner', apron: '#5b4636', satchel: false },
  builder: { hat: 'cap', apron: '#8a6a44', satchel: false },
  guard: { hat: 'helmet', apron: null, satchel: false },
  gatherer: { hat: null, apron: null, satchel: true },
};
const HAIR_STYLES = ['short', 'long', 'ponytail', 'bun', 'bald', 'spiky'];

/**
 * A settler's look from its identity: colors from `appearance`, outfit from
 * its preferred job, and hair style / beard from its id (stable per settler).
 */
export function getSettlerLook(npc) {
  const a = npc.appearance || {};
  const h = hashString(npc.id || 'settler');
  const gear = JOB_GEAR[npc.preferredJob] || JOB_GEAR.gatherer;
  const shirt = rgbToHex(a.clothingPrimary || [0.4, 0.4, 0.45]);
  const pants = rgbToHex(a.clothingSecondary || [0.35, 0.3, 0.25]);
  return {
    skin: rgbToHex(a.skinColor || [0.87, 0.72, 0.53]),
    hair: rgbToHex(a.hairColor || [0.4, 0.26, 0.13]),
    hairStyle: HAIR_STYLES[Math.floor(hash01(h, 1) * HAIR_STYLES.length)],
    beard: hash01(h, 2) < 0.3,
    eye: '#2a2420',
    shirt,
    trim: shade(shirt, 1.35),
    pants: pants === shirt ? shade(pants, 0.7) : pants,
    boots: '#3e2c20',
    belt: '#5b3a22',
    gloves: null,
    cape: null,
    sheathedSword: npc.preferredJob === 'guard',
    ...gear,
  };
}

/** Build the voxelRig model for a look. */
export function buildHumanoidModel(look, unit = 0.1) {
  const skinShade = shade(look.skin, 0.88);
  const colors = {
    skin: look.skin,
    skinShade,
    hair: look.hair,
    hairDark: shade(look.hair, 0.8),
    eye: look.eye,
    eyeWhite: '#f6f3ee',
    mouth: shade(look.skin, 0.68),
    shirt: look.shirt,
    shirtDark: shade(look.shirt, 0.8),
    trim: look.trim,
    pants: look.pants,
    boots: look.boots,
    bootCuff: shade(look.boots, 1.3),
    belt: look.belt,
    buckle: '#d9b45a',
    hands: look.gloves || look.skin,
    cape: look.cape || '#000000',
    capeDark: look.cape ? shade(look.cape, 0.75) : '#000000',
    leather: '#7a5634',
    steel: '#c8ced6',
    steelLight: '#e8edf2',
    iron: '#7d848c',
    wood: '#8a6239',
    woodDark: '#6a4a2a',
    gold: '#d4a73c',
    straw: '#e3c46b',
    strawDark: '#b8973f',
    helmet: '#9aa3ad',
    lamp: '#ffe9a0',
    apron: look.apron || '#000000',
    crate: '#a8743f',
    crateDark: '#7a5230',
  };

  const parts = [
    // Legs: trousers and boots
    ...pair('leg', 'pants', [2.8, 5, 3], [1.6, 8.5, 0]),
    ...pair('leg', 'pants', [2.6, 3, 2.8], [1.6, 4.5, 0]),
    ...pair('leg', 'boots', [3, 3, 3.6], [1.6, 1.5, 0.3]),
    ...pair('leg', 'bootCuff', [3.2, 0.8, 3.4], [1.6, 3.2, 0.2]),

    // Torso: tunic with a trimmed hem, belt and buckle, open collar
    ['body', 'shirt', [7, 8, 4], [0, 15, 0]],
    ['body', 'shirtDark', [7.4, 2.4, 4.4], [0, 10.4, 0]],
    ['body', 'trim', [7.5, 0.4, 4.5], [0, 9.3, 0]],
    ['body', 'belt', [7.6, 1.2, 4.6], [0, 11.6, 0]],
    ['body', 'buckle', [1.4, 1, 0.4], [0, 11.6, 2.4]],
    ['body', 'skin', [2, 1.6, 0.3], [0, 18.1, 2.05]],
    ['body', 'trim', [5.2, 0.6, 4.3], [0, 18.9, 0]],

    // Head: face, eyes, brows, nose, mouth, ears
    ['head', 'skin', [2, 1, 2], [0, 19.6, 0]],
    ['head', 'skin', [6, 6, 6], [0, 23, 0]],
    ...sym('head', 'eyeWhite', [1.2, 1.2, 0.2], [1.5, 23, 3.05]),
    ...sym('head', 'eye', [0.6, 1, 0.25], [1.3, 23, 3.1]),
    ...sym('head', 'hairDark', [1.4, 0.4, 0.2], [1.5, 24.1, 3.05]),
    ['head', 'skinShade', [0.8, 1, 0.6], [0, 22.1, 3.2]],
    ['head', 'mouth', [1.6, 0.4, 0.2], [0, 21.1, 3.05]],
    ...sym('head', 'skinShade', [0.6, 1.4, 1], [3.2, 23, 0]),

    // Arms: sleeves with trimmed cuffs, then hands (or gloves)
    ...pair('arm', 'shirt', [2.4, 4, 2.6], [4.6, 16.6, 0]),
    ...pair('arm', 'trim', [2.5, 0.6, 2.7], [4.6, 14.4, 0]),
    ...pair('arm', 'skin', [2, 3.4, 2.2], [4.6, 12.4, 0]),
    ...pair('arm', 'hands', [2.2, 1.8, 2.4], [4.6, 9.8, 0.2]),

    // Tools (hidden until used), all pointing forward from the right hand
    ['toolSword', 'leather', [0.8, 0.8, 1.6], [-4.6, 9.8, 1.2]],
    ['toolSword', 'gold', [2.6, 0.6, 0.6], [-4.6, 9.8, 2.2]],
    ['toolSword', 'steel', [0.6, 1.4, 8], [-4.6, 9.8, 6.5]],
    ['toolSword', 'steelLight', [0.62, 0.4, 8], [-4.6, 10.5, 6.5]],
    ['toolPick', 'wood', [0.8, 0.8, 8], [-4.6, 9.8, 4]],
    ['toolPick', 'iron', [1, 6.4, 1.2], [-4.6, 9.8, 8.4]],
    ['toolPick', 'steel', [0.6, 1, 0.8], [-4.6, 13.4, 8.4]],
    ['toolPick', 'steel', [0.6, 1, 0.8], [-4.6, 6.2, 8.4]],
    ['toolHammer', 'wood', [0.7, 0.7, 6], [-4.6, 9.8, 3.4]],
    ['toolHammer', 'iron', [1.8, 3, 2], [-4.6, 9.8, 6.8]],
    ['toolHoe', 'wood', [0.7, 0.7, 10], [-4.6, 9.8, 5.4]],
    ['toolHoe', 'iron', [0.9, 2.6, 1.4], [-4.6, 8.6, 10.4]],
    ['carry', 'crate', [5, 4, 4], [0, 13, 5.4]],
    ['carry', 'crateDark', [5.1, 0.6, 4.1], [0, 14.2, 5.4]],
    ['carry', 'crateDark', [0.6, 4.1, 4.1], [0, 13, 5.4]],
  ];

  // Hair
  const hairTop = [['head', 'hair', [6.4, 1.6, 6.4], [0, 26.2, -0.1]]];
  const hairBack = [['head', 'hair', [6.4, 4.4, 1.2], [0, 23.8, -3.1]]];
  const hairSides = sym('head', 'hair', [0.8, 2.6, 5], [3.2, 24.4, -0.6]);
  switch (look.hairStyle) {
    case 'bald':
      parts.push(['head', 'hair', [6.2, 1.4, 1.2], [0, 23.4, -3.05]]);
      break;
    case 'long':
      parts.push(...hairTop, ...hairSides,
        ['head', 'hair', [6.6, 7.6, 1.4], [0, 22.4, -3.2]],
        ...sym('head', 'hair', [1, 5, 2.4], [3.3, 21.8, -1.8]),
        ['head', 'hair', [6.4, 1, 0.8], [0, 25.6, 3.1]]);
      break;
    case 'ponytail':
      parts.push(...hairTop, ...hairBack, ...hairSides,
        ['head', 'hair', [6.4, 1, 0.8], [0, 25.6, 3.1]],
        ['head', 'hairDark', [1.4, 1, 1], [0, 24.6, -3.9]],
        ['head', 'hair', [1.6, 4.4, 1.4], [0, 22.2, -4.3]]);
      break;
    case 'bun':
      parts.push(...hairTop, ...hairBack, ...hairSides,
        ['head', 'hair', [3, 2.6, 3], [0, 27.6, -1.6]]);
      break;
    case 'spiky':
      parts.push(...hairTop, ...hairBack, ...hairSides,
        ['head', 'hair', [1.4, 1.6, 1.4], [-1.8, 27.6, 0.6]],
        ['head', 'hair', [1.4, 2, 1.4], [0.4, 27.8, -0.4]],
        ['head', 'hair', [1.4, 1.4, 1.4], [2, 27.4, 1.2]]);
      break;
    case 'swept':
      parts.push(...hairTop, ...hairBack, ...hairSides,
        ['head', 'hair', [6.4, 1.2, 0.8], [0, 25.6, 3.1]],
        ['head', 'hair', [2.4, 0.8, 0.9], [1.6, 24.8, 3.15]]);
      break;
    default: // short
      parts.push(...hairTop, ...hairBack, ...hairSides,
        ['head', 'hair', [6.4, 1, 0.8], [0, 25.6, 3.1]]);
  }
  if (look.beard) {
    parts.push(
      ['head', 'hair', [4.6, 2, 0.8], [0, 20.6, 3.1]],
      ...sym('head', 'hair', [0.8, 2.4, 2], [2.7, 21.6, 2.4]),
      ['head', 'hair', [2, 0.5, 0.25], [0, 21.8, 3.2]],
    );
  }

  // Hats
  switch (look.hat) {
    case 'straw':
      parts.push(
        ['head', 'straw', [10, 0.6, 10], [0, 26.6, 0]],
        ['head', 'straw', [6.6, 2.4, 6.6], [0, 28, 0]],
        ['head', 'strawDark', [6.7, 0.6, 6.7], [0, 27.2, 0]],
      );
      break;
    case 'cap':
      parts.push(
        ['head', 'shirtDark', [6.6, 2, 6.6], [0, 26.6, 0]],
        ['head', 'shirtDark', [5, 0.5, 2.6], [0, 25.8, 4.2]],
      );
      break;
    case 'miner':
      parts.push(
        ['head', 'helmet', [6.8, 2.4, 6.8], [0, 26.6, 0]],
        ['head', 'helmet', [7.6, 0.5, 7.6], [0, 25.6, 0]],
        ['head', 'lamp', [1.6, 1.4, 0.6], [0, 26.6, 3.6]],
      );
      break;
    case 'helmet':
      parts.push(
        ['head', 'helmet', [6.8, 3, 6.8], [0, 26.4, 0]],
        ['head', 'helmet', [1, 3.2, 1], [0, 24, 3.4]],
        ...sym('head', 'helmet', [0.6, 3, 5], [3.3, 23.8, -0.8]),
      );
      break;
    default:
      break;
  }

  // Extras
  if (look.cape) {
    parts.push(
      ['cape', 'cape', [7, 9, 0.6], [0, 14.2, -2.5]],
      ['cape', 'capeDark', [7.4, 1.2, 1], [0, 18.6, -2.3]],
      ['cape', 'capeDark', [7, 0.6, 0.7], [0, 9.9, -2.5]],
      ...sym('cape', 'trim', [1.2, 1.2, 0.6], [2.9, 18.6, -1.8]),
    );
  }
  if (look.apron) {
    parts.push(
      ['body', 'apron', [5.6, 7.4, 0.4], [0, 12.4, 2.25]],
      ['body', 'apron', [3.2, 2, 0.4], [0, 16.6, 2.25]],
    );
  }
  if (look.satchel) {
    // Strap from the left shoulder to the bag on the right hip
    for (let i = 0; i < 6; i++) parts.push(['body', 'belt', [1, 1, 0.3], [2.4 - i, 18 - i, 2.1]]);
    parts.push(['body', 'leather', [1.4, 2.8, 2.8], [-4.2, 11.2, 0.6]]);
    parts.push(['body', 'buckle', [0.3, 0.6, 0.6], [-4.95, 11.6, 0.8]]);
  }
  if (look.sheathedSword) {
    parts.push(
      ['body', 'woodDark', [0.9, 0.9, 5.2], [4.2, 10.4, -2.6]],
      ['body', 'gold', [2, 0.6, 0.6], [4.2, 10.4, -0.1]],
      ['body', 'leather', [0.8, 0.8, 1.8], [4.2, 10.4, 1]],
    );
  }

  return { unit, colors, bones: BONES, parts };
}

const cachedGeometry = createGeometryCache();

/** A stable key for a look, so identical looks share geometry. */
function lookKey(look, unit) {
  return `${unit}|${Object.keys(look).sort().map((k) => `${k}:${look[k]}`).join(',')}`;
}

/**
 * A posable humanoid. Tool bones start hidden; humanoidAnimation shows them.
 * @returns {object} rig from voxelRig.createRig
 */
export function createHumanoidInstance(look, { unit = 0.1 } = {}) {
  const model = buildHumanoidModel(look, unit);
  const geometries = cachedGeometry(lookKey(look, unit), () => buildRigGeometry(model, { boneNames: HUMANOID_BONES }));
  const rig = createRig(model, geometries, { boneNames: HUMANOID_BONES, roughness: 0.9 });
  for (const tool of TOOL_BONES) rig.bones[tool].scale.setScalar(0);
  return rig;
}

/** Settlers are a little smaller than the player. */
export const SETTLER_UNIT = 0.09;
