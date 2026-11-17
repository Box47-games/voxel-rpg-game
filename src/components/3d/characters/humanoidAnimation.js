/**
 * humanoidAnimation.js — Procedural animation for the player and settlers
 * (pure, no three.js). Returns poses for voxelRig.applyBonePose().
 *
 * Every pose sets each tool bone's scale (0 = hidden, 1 = in hand), so a tool
 * only appears while it's being used.
 *
 * Motion inputs:
 *  - speed: horizontal speed (world units/s); walk blends into a run
 *  - airborne: jumping (knee tucked, arms reaching) or falling (legs braced, arms out)
 *  - activity: a looping activity, one of
 *      'mine' | 'build' | 'farm' | 'carry' | 'eat' | 'wave' | null
 *  - alert: suppress idle glances
 * One-shot actions via triggerAction(): 'melee' | 'cast' | 'place'.
 *
 * Conventions (model faces +Z): negative rx on an arm swings it forward/up,
 * positive rx on a leg swings the foot back, positive body rx leans forward.
 */

import { TOOL_BONES } from './humanoidModel';

/** Vertical speed (world units/s) for the full rising or falling pose. */
const AIR_VY_FULL = 6;
const TAU = Math.PI * 2;
const MOVING_SPEED = 0.4;
const RUN_SPEED = 7; // full run pose at this speed
const STRIDE = 2.6; // world units per step cycle

export const ACTION_DURATION = { melee: 0.38, cast: 0.45, place: 0.28 };

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}
function lerp(a, b, t) {
  return a + (b - a) * t;
}
function bump(t) {
  return Math.sin(clamp(t, 0, 1) * Math.PI);
}

export function createHumanoidAnimState(seed = 0) {
  return {
    time: seed * 10,
    phase: seed * TAU,
    speed: 0,
    airborne: 0, // 0-1 blend into the jump pose
    rise: 0, // -1 (falling) .. 1 (rising), smoothed
    action: null, // { type, t }
    lookYaw: 0,
    lookTarget: 0,
    lookTimer: 2 + seed * 4,
    seed,
  };
}

/** Start a one-shot action (restarts it if already playing). */
export function triggerAction(anim, type) {
  if (!ACTION_DURATION[type]) return;
  anim.action = { type, t: 0 };
}

/**
 * @param {object} anim - from createHumanoidAnimState (mutated)
 * @param {{ speed: number, airborne?: boolean, vy?: number, activity?: string|null, alert?: boolean }} motion
 *   vy: vertical velocity (world units/s) picks the rising or falling pose
 * @param {number} delta - seconds
 */
export function stepHumanoidAnimation(anim, motion, delta) {
  const dt = Math.min(delta, 0.1);
  anim.time += dt;
  anim.speed = lerp(anim.speed, motion.speed, clamp(dt * 10, 0, 1));
  anim.airborne = lerp(anim.airborne, motion.airborne ? 1 : 0, clamp(dt * 12, 0, 1));
  anim.rise = lerp(anim.rise, clamp((motion.vy || 0) / AIR_VY_FULL, -1, 1), clamp(dt * 10, 0, 1));
  if (anim.action) {
    anim.action.t += dt;
    if (anim.action.t > ACTION_DURATION[anim.action.type]) anim.action = null;
  }

  const pose = { bones: {} };
  const b = (name) => {
    if (!pose.bones[name]) pose.bones[name] = {};
    return pose.bones[name];
  };
  for (const tool of TOOL_BONES) b(tool).sx = b(tool).sy = b(tool).sz = 0;
  const show = (tool) => { b(tool).sx = b(tool).sy = b(tool).sz = 1; };

  const body = b('body');
  const head = b('head');
  const armL = b('armL');
  const armR = b('armR');
  const legL = b('legL');
  const legR = b('legR');
  const cape = b('cape');

  // ── Locomotion ──
  const moving = anim.speed > MOVING_SPEED;
  const walk = clamp(anim.speed / 2.5, 0, 1);
  const run = clamp((anim.speed - 3) / (RUN_SPEED - 3), 0, 1);
  if (moving) anim.phase = (anim.phase + (dt * anim.speed * TAU) / STRIDE) % TAU;
  const s = Math.sin(anim.phase);
  const legSwing = (0.55 + run * 0.35) * walk;
  legL.rx = s * legSwing;
  legR.rx = -s * legSwing;
  armL.rx = -s * (0.45 + run * 0.4) * walk;
  armR.rx = s * (0.45 + run * 0.4) * walk;
  armL.rz = 0.06 + run * 0.1;
  armR.rz = -0.06 - run * 0.1;
  body.rx = run * 0.2;
  body.ry = s * 0.06 * walk;
  body.lift = Math.abs(Math.cos(anim.phase)) * (0.05 + run * 0.06) * walk
    + Math.sin(anim.time * 2.1) * 0.012 * (1 - walk); // breathing
  head.rx = -run * 0.15;
  // The cape streams back with speed and ripples
  cape.rx = -(0.1 + anim.speed * 0.07) - Math.sin(anim.time * 7) * 0.05 * walk;
  cape.rx = Math.max(cape.rx, -1.1);

  // ── Jumping / falling ──
  const air = anim.airborne;
  if (air > 0.01) {
    // Blend the rising pose (one knee driven up, arms reaching) into the
    // falling one (legs together and braced, arms out for balance)
    const up = (anim.rise + 1) / 2; // 0 falling .. 1 rising
    const mix = (fall, rise) => lerp(fall, rise, up);
    legL.rx = lerp(legL.rx, mix(-0.35, -1.05), air);
    legR.rx = lerp(legR.rx, mix(-0.2, 0.3), air);
    armL.rx = lerp(armL.rx, mix(-0.35, -1.35), air);
    armR.rx = lerp(armR.rx, mix(-0.35, -1.35), air);
    armL.rz = lerp(armL.rz, mix(1.0, 0.2), air);
    armR.rz = lerp(armR.rz, mix(-1.0, -0.2), air);
    body.rx = lerp(body.rx, mix(0.08, -0.06), air);
    body.lift = lerp(body.lift, 0, air);
    head.rx = lerp(head.rx, mix(0.15, -0.1), air); // look down at the landing
    cape.rx = lerp(cape.rx, mix(-1.05, -0.35), air); // streams up as you drop
  }

  // ── Idle glances ──
  if (moving || motion.alert || motion.activity || anim.action) {
    anim.lookTarget = 0;
  } else {
    anim.lookTimer -= dt;
    if (anim.lookTimer <= 0) {
      anim.lookTarget = anim.lookTarget === 0 ? (Math.sin(anim.time * 12.9898 + anim.seed) > 0 ? 0.5 : -0.5) : 0;
      anim.lookTimer = 1.5 + (Math.sin(anim.time * 78.233) * 0.5 + 0.5) * 3;
    }
  }
  anim.lookYaw = lerp(anim.lookYaw, anim.lookTarget, clamp(dt * 4, 0, 1));
  head.ry = anim.lookYaw;

  // ── Looping activities ──
  const t = anim.time;
  switch (motion.activity) {
    case 'mine': {
      // Pickaxe overhead, then down hard
      show('toolPick');
      const c = (t * 1.8) % 1;
      armR.rx = c < 0.55 ? lerp(-0.3, -2.7, c / 0.55) : lerp(-2.7, -0.3, (c - 0.55) / 0.45);
      armL.rx = armR.rx * 0.6;
      armL.rz = 0.15;
      body.rx += c >= 0.55 ? 0.25 * bump((c - 0.55) / 0.45) : -0.08;
      break;
    }
    case 'build': {
      show('toolHammer');
      const c = (t * 2.6) % 1;
      armR.rx = c < 0.6 ? lerp(-0.9, -2.1, c / 0.6) : lerp(-2.1, -0.9, (c - 0.6) / 0.4);
      armL.rx = -1;
      body.rx += 0.15;
      break;
    }
    case 'farm': {
      // Hoe with both hands, bowing into each stroke
      show('toolHoe');
      const c = (t * 1.3) % 1;
      const stroke = c < 0.5 ? lerp(-1.6, -0.5, c / 0.5) : lerp(-0.5, -1.6, (c - 0.5) / 0.5);
      armR.rx = stroke;
      armL.rx = stroke + 0.15;
      armL.rz = -0.25; // left hand crosses to grip the handle
      body.rx += 0.18 + bump(c) * 0.12;
      break;
    }
    case 'carry':
      show('carry');
      armL.rx = -1.25;
      armR.rx = -1.25;
      armL.rz = -0.12;
      armR.rz = 0.12;
      body.rx -= 0.06;
      break;
    case 'eat': {
      const c = (t * 0.8) % 1;
      armR.rx = -0.4 - 1.9 * bump(clamp(c / 0.5, 0, 1));
      armR.rz = 0.25;
      head.rx = 0.12 * bump(clamp(c / 0.5, 0, 1));
      break;
    }
    case 'wave':
      armR.rx = -2.6;
      armR.rz = -0.3 + Math.sin(t * 9) * 0.35;
      break;
    default:
      break;
  }

  // ── One-shot actions ──
  if (anim.action) {
    const a = anim.action.t / ACTION_DURATION[anim.action.type];
    if (anim.action.type === 'melee') {
      // Sword from over the shoulder, slashing down and across
      show('toolSword');
      armR.rx = a < 0.35 ? lerp(-0.6, -2.6, a / 0.35) : lerp(-2.6, -0.4, clamp((a - 0.35) / 0.4, 0, 1));
      armR.rz = -0.2 + 0.5 * bump(a);
      body.ry = a < 0.35 ? 0.35 * (a / 0.35) : lerp(0.35, -0.3, clamp((a - 0.35) / 0.4, 0, 1));
      body.rx += 0.15 * bump(a);
    } else if (anim.action.type === 'cast') {
      // Both hands thrust forward, palms out
      const push = a < 0.4 ? a / 0.4 : 1 - (a - 0.4) / 0.6;
      armL.rx = lerp(armL.rx, -1.55, push);
      armR.rx = lerp(armR.rx, -1.55, push);
      armL.rz = lerp(armL.rz, -0.2, push);
      armR.rz = lerp(armR.rz, 0.2, push);
      body.rx += -0.12 * bump(a / 0.4) + 0.1 * push;
    } else if (anim.action.type === 'place') {
      show('toolHammer');
      armR.rx = -0.6 - 1.2 * bump(a);
    }
  }

  return pose;
}
