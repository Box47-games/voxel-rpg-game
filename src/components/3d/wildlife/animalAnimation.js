/**
 * animalAnimation.js — Procedural animation for wildlife (pure, no three.js).
 *
 * stepAnimation() advances an animal's animation state by one frame and
 * returns a pose: bone rotations (radians) plus a small body lift. Gaits:
 *  - walk:   diagonal legs move together (deer, wolf, bear, opossum)
 *  - bound:  front pair and back pair alternate (squirrel, puma)
 *  - waddle: walk with a side-to-side roll (raccoon, beaver, skunk, mole)
 *  - fly:    flapping wings; `glide` species coast between flaps (crow)
 * While standing still each species idles: graze (head down to eat), sniff
 * (quick nose bobs) or look (slow head turns).
 *
 * Rotation conventions (model faces +Z): positive pitch lowers the head and
 * raises the tail; positive leg pitch swings the foot backward; positive wing
 * lift raises the wing tip.
 */

const TAU = Math.PI * 2;
const MOVING_SPEED = 0.25; // world units/s below which an animal counts as still
const GLIDE_WING_LIFT = 0.1; // wings held just above level

const IDLE_ACTIONS = {
  graze: { pitch: 0.95, yaw: 0, duration: [2.5, 5] },
  sniff: { pitch: 0.3, yaw: 0, duration: [0.8, 1.6] },
  look: { pitch: -0.1, yaw: 0.65, duration: [1.2, 2.5] },
};

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
}

/** Small deterministic generator so each animal idles on its own rhythm. */
function nextRandom(anim) {
  anim.rand = (Math.imul(anim.rand, 1664525) + 1013904223) >>> 0;
  return anim.rand / 4294967296;
}

export function createAnimState(seed = 0) {
  return {
    rand: Math.floor(seed * 4294967295) >>> 0,
    time: seed * 10,
    phase: seed * TAU,
    flap: seed * TAU,
    speed: 0,
    idleTimer: 1 + seed * 3,
    action: null, // { pitch, yaw, timeLeft }
    head: { pitch: 0, yaw: 0 },
    tailLift: 0,
    glideTimer: 0,
    gliding: false,
    wingLift: GLIDE_WING_LIFT,
  };
}

/**
 * Advance the animation by `delta` seconds.
 * @param {object} anim - from createAnimState (mutated)
 * @param {object} spec - the species' `anim` settings
 * @param {{ speed: number, verticalSpeed?: number, fleeing?: boolean }} motion
 * @returns {{ bodyLift, bodyPitch, bodyRoll, headPitch, headYaw, tailPitch,
 *   tailYaw, legs: { FL, FR, BL, BR }, wingLift }}
 */
export function stepAnimation(anim, spec, motion, delta) {
  const dt = Math.min(delta, 0.1);
  anim.time += dt;
  anim.speed = lerp(anim.speed, motion.speed, clamp(dt * 8, 0, 1));
  const moving = anim.speed > MOVING_SPEED;
  const gait = spec.gait;

  const pose = {
    bodyLift: 0, bodyPitch: 0, bodyRoll: 0,
    headPitch: 0, headYaw: 0, tailPitch: 0, tailYaw: 0,
    legs: { FL: 0, FR: 0, BL: 0, BR: 0 },
    wingLift: 0,
  };

  // ── Locomotion ──
  if (gait === 'fly') {
    flyPose(anim, spec, motion, dt, pose);
  } else {
    const weight = clamp(anim.speed / 1.5, 0, 1); // blend in the gait as speed builds
    if (moving) anim.phase = (anim.phase + (dt * anim.speed * TAU) / spec.stride) % TAU;
    const s = Math.sin(anim.phase) * spec.legSwing * weight;
    if (gait === 'bound') {
      pose.legs.FL = pose.legs.FR = s;
      pose.legs.BL = pose.legs.BR = -s;
      pose.bodyPitch = Math.sin(anim.phase) * 0.1 * weight;
    } else {
      pose.legs.FL = pose.legs.BR = s;
      pose.legs.FR = pose.legs.BL = -s;
      if (gait === 'waddle') pose.bodyRoll = Math.sin(anim.phase) * 0.09 * weight;
    }
    pose.bodyLift = Math.abs(Math.cos(anim.phase)) * spec.bob * weight
      + Math.sin(anim.time * 2) * 0.008 * (1 - weight); // breathing at rest
  }

  // ── Head: idle actions while still, a gentle nod while moving ──
  let targetPitch = 0;
  let targetYaw = 0;
  if (moving || motion.fleeing) {
    anim.action = null;
    anim.idleTimer = 0.8 + nextRandom(anim) * 2;
    if (gait !== 'fly') targetPitch = Math.sin(anim.phase * 2) * 0.06;
  } else if (anim.action) {
    anim.action.timeLeft -= dt;
    targetPitch = anim.action.pitch;
    targetYaw = anim.action.yaw;
    if (spec.idle === 'sniff') targetPitch += Math.sin(anim.time * 16) * 0.08;
    if (anim.action.timeLeft <= 0) {
      anim.action = null;
      anim.idleTimer = 1.5 + nextRandom(anim) * 4;
    }
  } else {
    anim.idleTimer -= dt;
    if (anim.idleTimer <= 0) {
      const def = IDLE_ACTIONS[spec.idle] || IDLE_ACTIONS.sniff;
      const side = nextRandom(anim) < 0.5 ? -1 : 1;
      anim.action = {
        pitch: def.pitch,
        yaw: def.yaw * side,
        timeLeft: lerp(def.duration[0], def.duration[1], nextRandom(anim)),
      };
    }
  }
  const headEase = clamp(dt * 5, 0, 1);
  anim.head.pitch = lerp(anim.head.pitch, targetPitch, headEase);
  anim.head.yaw = lerp(anim.head.yaw, targetYaw, headEase);
  pose.headPitch = anim.head.pitch;
  pose.headYaw = anim.head.yaw;

  // ── Tail ──
  let tailLift = 0;
  switch (spec.tail) {
    case 'wag':
      pose.tailYaw = Math.sin(anim.time * (moving ? 9 : 4)) * (moving ? 0.35 : 0.15);
      break;
    case 'sway':
      pose.tailYaw = Math.sin(anim.time * 1.6) * 0.18;
      break;
    case 'flick':
      pose.tailYaw = Math.sin(anim.time * 3) * 0.1;
      tailLift = Math.max(0, Math.sin(anim.time * 2.3)) ** 6 * 0.5;
      break;
    case 'flag':
      // White-tailed alarm: the tail goes straight up while fleeing
      tailLift = motion.fleeing ? 1.3 : Math.max(0, Math.sin(anim.time * 1.7)) ** 8 * 0.4;
      break;
    default:
      break;
  }
  anim.tailLift = lerp(anim.tailLift, tailLift, clamp(dt * 8, 0, 1));
  pose.tailPitch = anim.tailLift;

  return pose;
}

function flyPose(anim, spec, motion, dt, pose) {
  const climbing = (motion.verticalSpeed || 0) > 0.5;
  if (spec.glide) {
    // Flap for a while, then coast on spread wings (never while climbing or fleeing)
    anim.glideTimer -= dt;
    if (anim.glideTimer <= 0) {
      anim.gliding = !anim.gliding && !climbing && !motion.fleeing;
      anim.glideTimer = anim.gliding ? 1 + nextRandom(anim) * 1.5 : 1.2 + nextRandom(anim) * 1.5;
    }
    if (climbing || motion.fleeing) anim.gliding = false;
  }
  const rate = spec.flapRate * (motion.fleeing ? 1.4 : 1);
  if (anim.gliding) {
    // Ease the wings out level and hold them; the next flap starts from level
    anim.wingLift = lerp(anim.wingLift, GLIDE_WING_LIFT, clamp(dt * 8, 0, 1));
    anim.flap = 0;
    pose.bodyLift = 0;
  } else {
    anim.flap = (anim.flap + dt * rate * TAU) % TAU;
    anim.wingLift = Math.sin(anim.flap) * spec.flapAmp + GLIDE_WING_LIFT;
    pose.bodyLift = -Math.sin(anim.flap) * 0.04; // the body dips as the wings rise
  }
  pose.wingLift = anim.wingLift;
  pose.bodyPitch = clamp(-(motion.verticalSpeed || 0) * 0.1, -0.35, 0.35);
}
