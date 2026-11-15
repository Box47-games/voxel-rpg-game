/**
 * NPCStateMachine.js — NPC needs decay and state machine.
 *
 * This is the live settlement NPC logic (ported from SettlementTick.jsx).
 * No store import: it receives an NPC + context and returns the NPC's updates
 * and notifications. World side effects (eating food, mining blocks, delivering
 * materials) go through `context.host`; the work loop lives in NPCWorkBehavior.
 *
 * Movement and arrival are NOT handled here. SettlerNPC.jsx walks the NPC to
 * `targetPosition` and performs the on-arrival transitions
 * (APPROACHING → EVALUATING, WANDERING/SOCIALIZING → IDLE).
 */

import {
  NPC_HUNGER_DECAY_RATE,
  NPC_REST_DECAY_RATE,
  NPC_HUNGER_CRITICAL,
  NPC_REST_CRITICAL,
  NPC_WANDER_RADIUS,
  NPC_SOCIAL_DECAY_RATE,
  NPC_SOCIAL_CRITICAL,
  NPC_SOCIAL_RESTORE,
  NPC_SOCIAL_DURATION,
  NPC_EVALUATION_DURATION,
  NPC_EATING_DURATION,
  NPC_LEAVE_HAPPINESS_THRESHOLD,
  NPC_LEAVE_WARNING_DAYS,
  NPC_LEAVE_DEPARTURE_DAYS,
  DAY_LENGTH_SECONDS,
  IMMIGRATION_THRESHOLD,
  IMMIGRATION_SPAWN_MAX_DIST,
  NPC_APPROACH_TIMEOUT,
  NPC_LEAVING_TIMEOUT,
  NPC_THOUGHT_DURATION,
  NPC_INITIAL_SOCIAL,
  NPC_HAPPINESS_HUNGER_WEIGHT,
  NPC_HAPPINESS_REST_WEIGHT,
  NPC_HAPPINESS_SOCIAL_WEIGHT,
  NPC_HAPPINESS_BASE,
  NPC_SLEEP_RESTORE_RATE,
  NPC_SLEEP_WAKE_REST,
  NPC_DEFAULT_EATING_RESTORE,
  NPC_SOCIALIZE_SEARCH_RADIUS,
  NPC_WANDER_TIMEOUT,
  NPC_LEAVE_EXTRA_DISTANCE,
  HOUSING_HOMELESS_HAPPINESS_PENALTY,
} from '../../data/tuning';
import {
  takeFood,
  tryResumeTask,
  tryStartWork,
  abandonTask,
  isWorkState,
  tickWorkState,
} from './NPCWorkBehavior';
import { resolveHomeId, getSleepTarget, isSettled } from './housing';

// ── Personality helpers ─────────────────────────────────────

export function getIdleTimerRange(personality) {
  switch (personality) {
    case 'diligent': return [3, 8];
    case 'lazy': return [10, 20];
    case 'curious': return [3, 8];
    default: return [5, 15];
  }
}

export function getWanderRadiusMult(personality) {
  switch (personality) {
    case 'brave': return 2.0;
    case 'cautious': return 0.5;
    default: return 1.0;
  }
}

export function getSocialDecayMult(personality) {
  if (personality === 'stoic') return 0.5;
  return 1.0;
}

export function getPersonalityHappinessBonus(personality) {
  switch (personality) {
    case 'cheerful': return 10;
    case 'grumpy': return -10;
    default: return 0;
  }
}

/** A point on the ring departing NPCs walk to before they are removed. */
function pickLeaveTarget(center) {
  const leaveAngle = Math.random() * Math.PI * 2;
  const leaveDist = IMMIGRATION_SPAWN_MAX_DIST + NPC_LEAVE_EXTRA_DISTANCE;
  return [
    center[0] + Math.cos(leaveAngle) * leaveDist,
    center[1],
    center[2] + Math.sin(leaveAngle) * leaveDist,
  ];
}

/**
 * Tick a single NPC's needs and state machine.
 *
 * @param {Object} npc - Flat NPC object from store.settlement.npcs
 * @param {number} tickDelta - Seconds since last needs tick
 * @param {Object} context
 * @param {number[]} context.center - Settlement center [x, y, z]
 * @param {number} context.attractiveness - Current attractiveness score
 * @param {Object[]} context.npcs - All settlement NPCs (for socializing neighbor search)
 * @param {Object[]} context.zones - Zones as of the start of the tick
 * @param {Object[]} context.constructionSites - Construction sites as of the start of the tick
 * @param {Object} context.inventory - store.inventory (has .materials) as of the start of the tick
 * @param {number} context.worldTimeElapsed - store.worldTime.elapsed
 * @param {Set} context.warnedNPCs - Set of NPC ids that have been warned (mutated in place)
 * @param {Object} context.chunkAdapter - { getBlock, setBlock }
 * @param {Object} context.host - World side-effect port (see SettlementBridge)
 * @param {Array} [context.notifications] - Shared array to append notifications to
 * @returns {{ updates: Object, remove?: boolean, taskCompleted?: boolean, notifications: Array }}
 */
export function tickNPC(npc, tickDelta, context) {
  const { center, attractiveness, npcs, worldTimeElapsed, warnedNPCs } = context;
  const notifications = context.notifications || [];

  // ── APPROACHING — tick timer; a stuck immigrant gives up ──
  // (Arrival is detected by SettlerNPC, which moves the NPC to EVALUATING.)
  if (npc.state === 'APPROACHING') {
    const timer = (npc.stateTimer || 0) + tickDelta;
    if (timer > NPC_APPROACH_TIMEOUT) {
      return {
        updates: {
          state: 'LEAVING',
          stateTimer: 0,
          targetPosition: [
            center[0] + (Math.random() - 0.5) * IMMIGRATION_SPAWN_MAX_DIST * 2,
            center[1],
            center[2] + (Math.random() - 0.5) * IMMIGRATION_SPAWN_MAX_DIST * 2,
          ],
        },
        notifications,
      };
    }
    return { updates: { stateTimer: timer }, notifications };
  }

  // ── LEAVING — removed once the timeout expires, wherever the NPC got to ──
  if (npc.state === 'LEAVING') {
    const timer = (npc.stateTimer || 0) + tickDelta;
    if (timer > NPC_LEAVING_TIMEOUT) {
      return { updates: {}, remove: true, notifications };
    }
    return { updates: { stateTimer: timer }, notifications };
  }

  // ── Settled NPC: decay needs ──
  const updates = {};
  const personality = npc.personality || 'stoic';

  let newHunger = npc.hunger - NPC_HUNGER_DECAY_RATE * tickDelta;
  let newRest = npc.rest - NPC_REST_DECAY_RATE * tickDelta;
  let newSocial = (npc.social ?? NPC_INITIAL_SOCIAL)
    - NPC_SOCIAL_DECAY_RATE * getSocialDecayMult(personality) * tickDelta;
  newHunger = Math.max(0, Math.min(100, newHunger));
  newRest = Math.max(0, Math.min(100, newRest));
  newSocial = Math.max(0, Math.min(100, newSocial));
  updates.hunger = newHunger;
  updates.rest = newRest;
  updates.social = newSocial;

  // ── Home (re)assignment ──
  const homeId = resolveHomeId(npc, context);
  if (homeId !== (npc.homeId ?? null)) updates.homeId = homeId;
  // Only penalize when housing is actually being tracked this tick
  const homelessPenalty = context.homeAssignments && !homeId && isSettled(npc)
    ? HOUSING_HOMELESS_HAPPINESS_PENALTY
    : 0;

  // ── Compute happiness ──
  updates.happiness = Math.max(0, Math.min(100,
    newHunger * NPC_HAPPINESS_HUNGER_WEIGHT +
    newRest * NPC_HAPPINESS_REST_WEIGHT +
    newSocial * NPC_HAPPINESS_SOCIAL_WEIGHT +
    NPC_HAPPINESS_BASE +
    getPersonalityHappinessBonus(personality) +
    homelessPenalty
  ));

  // ── Tick thought bubble timer ──
  if (npc.thoughtBubble) {
    const newTimer = (npc.thoughtBubble.timer || 0) - tickDelta;
    updates.thoughtBubble = newTimer <= 0 ? null : { ...npc.thoughtBubble, timer: newTimer };
  }

  // ── Unhappy day tracking & departure ──
  const dayCheckpoint = npc.dayCheckpoint ?? worldTimeElapsed;
  let unhappyDays = npc.unhappyDays ?? 0;

  if (worldTimeElapsed - dayCheckpoint >= DAY_LENGTH_SECONDS) {
    updates.dayCheckpoint = worldTimeElapsed;
    if (updates.happiness < NPC_LEAVE_HAPPINESS_THRESHOLD) {
      unhappyDays++;
    } else {
      unhappyDays = Math.max(0, unhappyDays - 1);
    }
    updates.unhappyDays = unhappyDays;

    // Warning notification (once)
    if (unhappyDays >= NPC_LEAVE_WARNING_DAYS && !warnedNPCs.has(npc.id)) {
      warnedNPCs.add(npc.id);
      notifications.push({
        type: 'warning',
        title: 'Unhappy Settler',
        message: `${npc.fullName} is unhappy and may leave soon!`,
      });
    }

    // Departure
    if (unhappyDays >= NPC_LEAVE_DEPARTURE_DAYS) {
      updates.state = 'LEAVING';
      updates.stateTimer = 0;
      updates.targetPosition = pickLeaveTarget(center);
      abandonTask(npc, updates);
      notifications.push({
        type: 'error',
        title: 'Settler Leaving',
        message: `${npc.fullName} has decided to leave your settlement.`,
      });
      warnedNPCs.delete(npc.id);
      return { updates, notifications };
    }
  }

  // Reset warning if happiness recovered
  if (unhappyDays < NPC_LEAVE_WARNING_DAYS) {
    warnedNPCs.delete(npc.id);
  }

  // ── State machine ──
  const timer = (npc.stateTimer || 0) + tickDelta;
  updates.stateTimer = timer;
  let taskCompleted = false;

  switch (npc.state) {
    case 'EVALUATING':
      if (timer >= NPC_EVALUATION_DURATION) {
        if (attractiveness >= IMMIGRATION_THRESHOLD) {
          updates.state = 'IDLE';
          updates.stateTimer = 0;
          notifications.push({
            type: 'success',
            title: 'New Settler!',
            message: `${npc.fullName} has joined your settlement!`,
          });
        } else {
          updates.state = 'LEAVING';
          updates.stateTimer = 0;
          updates.targetPosition = pickLeaveTarget(center);
          notifications.push({
            type: 'warning',
            title: 'Settler Rejected',
            message: `${npc.fullName} didn't like what they saw and left.`,
          });
        }
      }
      break;

    case 'IDLE': {
      // 1) Critical needs first
      if (newHunger < NPC_HUNGER_CRITICAL) {
        const food = takeFood(context);
        if (food) {
          updates.state = 'EATING';
          updates.stateTimer = 0;
          updates.eatingRestore = food.restore;
          updates.thoughtBubble = { type: 'hungry', timer: NPC_THOUGHT_DURATION };
          updates._hungryWarned = false;
        } else if (!npc._hungryWarned) {
          // No food available — NPC stays IDLE and hungry
          updates._hungryWarned = true;
          notifications.push({
            type: 'warning',
            title: 'No Food',
            message: `${npc.fullName} is hungry but there's no food!`,
          });
        }
      } else if (newRest < NPC_REST_CRITICAL) {
        updates.state = 'SLEEPING';
        updates.stateTimer = 0;
        updates.targetPosition = getSleepTarget(npc, context);
        updates.thoughtBubble = { type: 'sleeping', timer: NPC_THOUGHT_DURATION };
      } else if (newSocial < NPC_SOCIAL_CRITICAL && npcs.length > 1) {
        // Find the nearest other settled NPC to socialize with
        let nearestDist = NPC_SOCIALIZE_SEARCH_RADIUS;
        let nearestNPC = null;
        for (const other of npcs) {
          if (other.id === npc.id || other.state === 'APPROACHING' || other.state === 'LEAVING') continue;
          const dx = (other.position[0] || 0) - (npc.position[0] || 0);
          const dz = (other.position[2] || 0) - (npc.position[2] || 0);
          const d = Math.sqrt(dx * dx + dz * dz);
          if (d < nearestDist) {
            nearestDist = d;
            nearestNPC = other;
          }
        }
        if (nearestNPC) {
          updates.state = 'SOCIALIZING';
          updates.stateTimer = 0;
          updates.targetPosition = [...nearestNPC.position];
          updates.thoughtBubble = { type: 'socializing', timer: NPC_THOUGHT_DURATION };
        }
      } else if (!tryStartWork(npc, updates)) {
        // 2) No work found — maybe wander
        const [idleMin, idleMax] = getIdleTimerRange(personality);
        if (timer > idleMin + Math.random() * (idleMax - idleMin)) {
          updates.state = 'WANDERING';
          updates.stateTimer = 0;
          const wanderAngle = Math.random() * Math.PI * 2;
          const wanderMult = getWanderRadiusMult(personality);
          const wanderDist = Math.random() * NPC_WANDER_RADIUS * wanderMult;
          updates.targetPosition = [
            center[0] + Math.cos(wanderAngle) * wanderDist,
            center[1],
            center[2] + Math.sin(wanderAngle) * wanderDist,
          ];
        }
      }
      break;
    }

    case 'EATING': {
      const restoreTotal = npc.eatingRestore || NPC_DEFAULT_EATING_RESTORE;
      const restoreRate = restoreTotal / NPC_EATING_DURATION;
      updates.hunger = Math.min(100, newHunger + restoreRate * tickDelta);
      if (timer >= NPC_EATING_DURATION) {
        updates.state = 'IDLE';
        updates.stateTimer = 0;
        updates.eatingRestore = 0;
        tryResumeTask(npc, updates);
      }
      break;
    }

    case 'SLEEPING':
      updates.rest = Math.min(100, newRest + NPC_SLEEP_RESTORE_RATE * tickDelta);
      if (updates.rest >= NPC_SLEEP_WAKE_REST) {
        updates.state = 'IDLE';
        updates.stateTimer = 0;
        updates.targetPosition = null;
        tryResumeTask(npc, updates);
      }
      break;

    case 'SOCIALIZING':
      updates.social = Math.min(100, newSocial + (NPC_SOCIAL_RESTORE / NPC_SOCIAL_DURATION) * tickDelta);
      if (timer >= NPC_SOCIAL_DURATION) {
        updates.state = 'IDLE';
        updates.stateTimer = 0;
        updates.targetPosition = null;
      }
      break;

    case 'WANDERING':
      // SettlerNPC sets IDLE when the target is reached; this is the fallback.
      if (!npc.targetPosition || timer > NPC_WANDER_TIMEOUT) {
        updates.state = 'IDLE';
        updates.stateTimer = 0;
        updates.targetPosition = null;
      }
      break;

    default:
      if (isWorkState(npc.state)) {
        taskCompleted = tickWorkState(npc, tickDelta, newHunger, newRest, updates, context);
      }
      break;
  }

  return { updates, notifications, taskCompleted };
}

