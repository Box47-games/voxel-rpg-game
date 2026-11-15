/**
 * enemyAnimation.js — Procedural animation for rift monsters (pure, no three.js).
 *
 * stepEnemyAnimation() advances a monster's animation state and returns a
 * pose: per-bone rotations (rx, ry, rz), lift (world units) and scale
 * (sx, sy, sz). Bones left out of a pose return to rest. Gaits:
 *  - hop:   the slime squashes, springs up stretched, and lands with a splat
 *  - biped: goblin and skeleton walk with swinging arms and swing a weapon
 *  - crawl: the shadow creeper scuttles on alternating tripods of legs
 * triggerAttack() and triggerHurt() start one-shot motions; stepDeath()
 * plays the death (topple, melt or curl up) and returns how far to fade.
 *
 * Rotation conventions (model faces +Z): positive rx tips a bone's far end
 * down/forward for the head and body, and swings a hanging limb backward;
 * negative rx on an arm raises it forward.
 */

const TAU = Math.PI * 2;
const MOVING_SPEED = 0.3;
export const ATTACK_DURATION = 0.55;
export const HURT_DURATION = 0.3;
export const DEATH_DURATION = 1.6;

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/** 0 → 1 → 0 bump over t in [0, 1]. */
function bump(t) {
  return Math.sin(clamp(t, 0, 1) * Math.PI);
}

export function createEnemyAnimState(seed = 0) {
  return {
    time: seed * 10,
    phase: seed * TAU,
    speed: 0,
    attack: -1, // seconds since the attack started, -1 = none
    hurt: -1,
    lookYaw: 0,
    lookTimer: 2 + seed * 3,
    lookTarget: 0,
  };
}

/** Start the attack motion (the hit itself is resolved by game logic). */
export function triggerAttack(anim) {
  anim.attack = 0;
}

/** Start the recoil from being hit. */
export function triggerHurt(anim) {
  anim.hurt = 0;
}

/**
 * Advance the animation by `delta` seconds.
 * @param {object} anim - from createEnemyAnimState (mutated)
 * @param {object} spec - the model's `anim` settings
 * @param {{ speed: number, alert?: boolean }} motion - horizontal speed and
 *   whether the monster is chasing something
 */
export function stepEnemyAnimation(anim, spec, motion, delta) {
  const dt = Math.min(delta, 0.1);
  anim.time += dt;
  anim.speed = lerp(anim.speed, motion.speed, clamp(dt * 8, 0, 1));
  if (anim.attack >= 0) {
    anim.attack += dt;
    if (anim.attack > ATTACK_DURATION) anim.attack = -1;
  }
  if (anim.hurt >= 0) {
    anim.hurt += dt;
    if (anim.hurt > HURT_DURATION) anim.hurt = -1;
  }

  // Idle monsters glance around; alert ones stare ahead
  const moving = anim.speed > MOVING_SPEED;
  if (moving || motion.alert) {
    anim.lookTarget = 0;
  } else {
    anim.lookTimer -= dt;
    if (anim.lookTimer <= 0) {
      anim.lookTarget = anim.lookTarget === 0 ? (Math.sin(anim.time * 12.9898) > 0 ? 0.6 : -0.6) : 0;
      anim.lookTimer = 1.2 + (Math.sin(anim.time * 78.233) * 0.5 + 0.5) * 2.5;
    }
  }
  anim.lookYaw = lerp(anim.lookYaw, anim.lookTarget, clamp(dt * 4, 0, 1));

  const pose = { bones: {} };
  if (spec.gait === 'hop') hopPose(anim, spec, moving, dt, pose);
  else if (spec.gait === 'crawl') crawlPose(anim, spec, moving, dt, pose);
  else bipedPose(anim, spec, moving, dt, pose);

  // Recoil from a hit: rock back and squash a little
  if (anim.hurt >= 0) {
    const k = bump(anim.hurt / HURT_DURATION);
    const body = bone(pose, 'body');
    body.rx = (body.rx || 0) - 0.3 * k;
    body.sy = (body.sy ?? 1) * (1 - 0.12 * k);
    body.sx = (body.sx ?? 1) * (1 + 0.08 * k);
    body.sz = (body.sz ?? 1) * (1 + 0.08 * k);
  }
  return pose;
}

function bone(pose, name) {
  if (!pose.bones[name]) pose.bones[name] = {};
  return pose.bones[name];
}

function hopPose(anim, spec, moving, dt, pose) {
  const body = bone(pose, 'body');
  const head = bone(pose, 'head');
  // One hop per cycle (phase 0 → 1): spring up stretched, land squashed
  if (moving) anim.phase = (anim.phase + dt * spec.hopRate * clamp(anim.speed / 1.5, 0.7, 1.6)) % 1;
  const t = moving ? anim.phase : -1;
  if (t >= 0) {
    if (t < 0.55) {
      const air = t / 0.55;
      body.lift = Math.sin(air * Math.PI) * spec.hopHeight;
      const stretch = Math.sin(air * Math.PI) * 0.18;
      body.sy = 1 + stretch;
      body.sx = body.sz = 1 - stretch * 0.5;
      body.rx = (air - 0.5) * 0.25; // lean into the jump, level on the way down
    } else {
      const squash = Math.sin(((t - 0.55) / 0.45) * Math.PI) * 0.25;
      body.sy = 1 - squash;
      body.sx = body.sz = 1 + squash * 0.6;
    }
  } else {
    // Jiggle in place
    const wobble = Math.sin(anim.time * 3.2) * 0.045;
    body.sy = 1 + wobble;
    body.sx = body.sz = 1 - wobble * 0.5;
  }
  if (anim.attack >= 0) {
    // Gather, then lunge forward stretched
    const a = anim.attack / ATTACK_DURATION;
    const gather = a < 0.35 ? bump(a / 0.7) : 0;
    const lunge = a >= 0.35 ? bump((a - 0.35) / 0.65) : 0;
    body.sy = (body.sy ?? 1) * (1 - 0.3 * gather) * (1 + 0.1 * lunge);
    body.sz = (body.sz ?? 1) * (1 + 0.35 * lunge);
    body.lift = (body.lift || 0) + 0.25 * lunge;
    body.rx = (body.rx || 0) + 0.3 * lunge;
  }
  head.ry = anim.lookYaw * 0.4;
}

function bipedPose(anim, spec, moving, dt, pose) {
  const weight = clamp(anim.speed / 1.5, 0, 1);
  if (moving) anim.phase = (anim.phase + (dt * anim.speed * TAU) / spec.stride) % TAU;
  const s = Math.sin(anim.phase) * spec.swing * weight;

  const body = bone(pose, 'body');
  const head = bone(pose, 'head');
  const armL = bone(pose, 'armL');
  const armR = bone(pose, 'armR');
  bone(pose, 'legL').rx = s;
  bone(pose, 'legR').rx = -s;
  armL.rx = -s * 0.8;
  armR.rx = spec.weaponRest + s * 0.25; // weapon held up and ready
  body.lift = Math.abs(Math.cos(anim.phase)) * 0.06 * weight + Math.sin(anim.time * 2) * 0.01;
  body.rx = spec.hunch + 0.06 * weight;
  body.rz = Math.sin(anim.phase) * 0.04 * weight;
  head.rx = -spec.hunch * 0.8;
  head.ry = anim.lookYaw;
  armL.rz = 0.08;
  armR.rz = -0.08;

  if (spec.rattle) {
    // Loose bones: the skull and arms jitter
    head.rz = Math.sin(anim.time * 23) * 0.04 + Math.sin(anim.time * 7) * 0.03;
    armL.rz += Math.sin(anim.time * 17) * 0.03;
  }

  if (anim.attack >= 0) {
    // Raise the weapon overhead, then bring it down hard
    const a = anim.attack / ATTACK_DURATION;
    let raise;
    if (a < 0.3) raise = lerp(spec.weaponRest, -2.6, a / 0.3);
    else if (a < 0.5) raise = lerp(-2.6, -0.2, (a - 0.3) / 0.2);
    else raise = lerp(-0.2, spec.weaponRest, (a - 0.5) / 0.5);
    armR.rx = raise;
    armR.rz = -0.08;
    body.rx += a < 0.3 ? -0.15 * (a / 0.3) : 0.25 * bump((a - 0.3) / 0.7);
    body.ry = a < 0.3 ? -0.25 * (a / 0.3) : -0.25 * (1 - clamp((a - 0.3) / 0.3, 0, 1));
  }
}

const TRIPOD_A = ['legFL', 'legMR', 'legBL'];
const TRIPOD_B = ['legFR', 'legML', 'legBR'];

function crawlPose(anim, spec, moving, dt, pose) {
  const weight = clamp(anim.speed / 1.5, 0, 1);
  if (moving) anim.phase = (anim.phase + (dt * anim.speed * TAU) / spec.stride) % TAU;
  const s = Math.sin(anim.phase);
  const c = Math.cos(anim.phase);

  for (const [group, sign] of [[TRIPOD_A, 1], [TRIPOD_B, -1]]) {
    for (const name of group) {
      const left = name.endsWith('L');
      const leg = bone(pose, name);
      // Legs sweep back and forth around Y; the stepping tripod lifts its tips
      leg.ry = s * sign * spec.swing * weight * (left ? 1 : -1);
      const lift = Math.max(0, c * sign) * 0.35 * weight;
      leg.rz = (left ? 1 : -1) * (lift + Math.sin(anim.time * 5 + name.length) * 0.03);
    }
  }

  const body = bone(pose, 'body');
  const head = bone(pose, 'head');
  const tail = bone(pose, 'tail');
  body.lift = Math.abs(s) * 0.05 * weight + Math.sin(anim.time * 1.5) * 0.03;
  body.ry = Math.sin(anim.phase) * 0.06 * weight;
  head.ry = anim.lookYaw * 0.6;
  head.rx = Math.sin(anim.time * 6) * 0.04; // twitching mandibles
  tail.rx = Math.sin(anim.time * 2.1) * 0.2;
  tail.rz = Math.sin(anim.time * 1.3) * 0.25;

  if (anim.attack >= 0) {
    // Rear up, then strike down with the head
    const a = anim.attack / ATTACK_DURATION;
    const rear = a < 0.4 ? bump(a / 0.8) : 0;
    const strike = a >= 0.4 ? bump((a - 0.4) / 0.6) : 0;
    body.rx = -0.45 * rear + 0.2 * strike;
    body.lift += 0.3 * rear;
    head.rx += 0.5 * strike - 0.2 * rear;
    for (const name of ['legFL', 'legFR']) {
      bone(pose, name).rz = (name.endsWith('L') ? 1 : -1) * 0.8 * rear;
    }
  }
}

/**
 * The death motion, `t` seconds after dying.
 * @returns {{ pose, tilt: number, sink: number, fade: number }} tilt (radians,
 *   whole body tips onto its side), sink (world units) and fade (0 → 1)
 */
export function stepDeath(spec, t) {
  const k = clamp(t / (DEATH_DURATION * 0.45), 0, 1);
  const ease = 1 - (1 - k) * (1 - k);
  const fadeK = clamp((t - DEATH_DURATION * 0.5) / (DEATH_DURATION * 0.5), 0, 1);
  const pose = { bones: {} };
  let tilt = 0;
  let sink = fadeK * 0.4;

  if (spec.gait === 'hop') {
    // Melt into a puddle
    const body = bone(pose, 'body');
    body.sy = lerp(1, 0.2, ease);
    body.sx = body.sz = lerp(1, 1.5, ease);
    sink = 0;
  } else if (spec.gait === 'crawl') {
    // Flip, legs curling inward
    for (const name of [...TRIPOD_A, ...TRIPOD_B]) {
      bone(pose, name).rz = (name.endsWith('L') ? 1 : -1) * 1.1 * ease;
    }
    bone(pose, 'tail').rx = -0.6 * ease;
    tilt = Math.PI * 0.5 * ease;
  } else {
    // Crumple: knees give, then topple sideways
    bone(pose, 'legL').rx = -0.6 * ease;
    bone(pose, 'legR').rx = -0.4 * ease;
    bone(pose, 'armL').rz = 0.6 * ease;
    bone(pose, 'armR').rz = -0.9 * ease;
    bone(pose, 'head').rx = 0.5 * ease;
    tilt = (Math.PI / 2) * ease;
  }
  return { pose, tilt, sink, fade: fadeK };
}
