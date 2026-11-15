/**
 * playerActions.js — The player's most recent visible action, for animation.
 *
 * Game logic notes what the player just did (cast a spell, swung a weapon,
 * mined or placed a block) and Player.jsx reads it each frame to play the
 * matching animation. A plain module variable: no store writes, no re-renders.
 */

let lastAction = null;
let sequence = 0;

/** @param {'melee'|'cast'|'mine'|'place'} type */
export function notePlayerAction(type) {
  sequence++;
  lastAction = { type, at: performance.now(), seq: sequence };
}

/** The latest action ({ type, at, seq }) or null. */
export function getLastPlayerAction() {
  return lastAction;
}

/** Forget the last action (tests, new game). */
export function clearPlayerAction() {
  lastAction = null;
}
