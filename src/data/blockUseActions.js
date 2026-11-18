/**
 * blockUseActions.js — Defines blocks usable with the E key.
 * Harvesting bushes, picking up campfires, etc.
 */

import { BlockTypes } from '../systems/chunks/blockTypes';

export const BLOCK_USE_ACTIONS = {
  [BlockTypes.BERRY_BUSH]: {
    action: 'harvest',
    // Seeds plant farm tiles (one each)
    drops: [{ material: 'berry', min: 1, max: 3 }, { material: 'seed', min: 0, max: 2 }],
    destroyBlock: true,
  },
  [BlockTypes.CAMPFIRE]: {
    action: 'pickup',
    drops: [{ material: 'wood', min: 2, max: 2 }],
    destroyBlock: true,
  },
};

export function isUsableBlock(blockType) {
  return !!BLOCK_USE_ACTIONS[blockType];
}
