/**
 * NPCWorkBehavior.js — The NPC work loop (find work, mine, haul, build) and the
 * needs interrupts that pause and resume it.
 *
 * Ported from the inline logic that used to live in SettlementTick.jsx. No store
 * import: everything the work loop changes outside the NPC itself goes through
 * `ctx.host` (see SettlementBridge for the live implementation) so the loop can
 * be unit-tested with a fake host.
 *
 * Each function mutates the `updates` object for the NPC being ticked.
 *
 * Seam for new work types (guard, farm, ...): add a task type to the task
 * registry, a WORKING_* entry in WORK_STATE_BY_TASK_TYPE, and a tick function
 * in WORK_STATE_TICKERS.
 */

import { BlockTypes } from '../../systems/chunks/blockTypes';
import { calculateDrops } from '../../data/blockDrops';
import { scanMiningZone } from '../../systems/settlement/MiningZoneScanner';
import { getSleepTarget } from './housing';
import {
  findBestTask,
  claimTask,
  releaseTask,
  completeTask,
  getTask,
} from '../../systems/settlement/TaskAssignmentEngine';
import {
  NPC_HUNGER_CRITICAL,
  NPC_REST_CRITICAL,
  NPC_FOOD_SOURCES,
  NPC_MINE_DURATION,
  NPC_BUILD_DURATION,
  NPC_WORK_RANGE,
  NPC_MINE_TOOL_TIER,
  NPC_THOUGHT_DURATION,
  NPC_SKILL_GROWTH,
  NPC_WORK_SKILL_FALLBACK,
  NPC_SKILL_GROWTH_BASE,
} from '../../data/tuning';

const WORK_STATE_BY_TASK_TYPE = {
  MINE: 'WORKING_MINE',
  HAUL: 'WORKING_HAUL',
  BUILD: 'WORKING_BUILD',
};

const THOUGHT_BY_TASK_TYPE = {
  MINE: 'mining',
  HAUL: 'hauling',
  BUILD: 'building',
};

function workStateFor(task) {
  return WORK_STATE_BY_TASK_TYPE[task.type] || 'WORKING_BUILD';
}

function thoughtFor(task) {
  return THOUGHT_BY_TASK_TYPE[task.type] || 'building';
}

/** Horizontal distance from an NPC to a target position. */
function distanceTo(npc, target) {
  const dx = (target[0] || 0) - (npc.position[0] || 0);
  const dz = (target[2] || 0) - (npc.position[2] || 0);
  return Math.sqrt(dx * dx + dz * dz);
}

function growSkill(npc, updates, skill) {
  const newSkills = { ...(npc.skills || {}) };
  newSkills[skill] = Math.min(1.0, (newSkills[skill] || NPC_SKILL_GROWTH_BASE) + NPC_SKILL_GROWTH);
  updates.skills = newSkills;
}

/**
 * Take one unit of food for a hungry NPC: stockpiles first (in zone order),
 * then the player's inventory. Food is checked against the tick-start snapshot
 * (ctx.zones / ctx.inventory), as the inline tick did.
 *
 * @returns {{ material: string, restore: number }|null} The food eaten, or null
 */
export function takeFood(ctx) {
  for (const zone of ctx.zones) {
    if (zone.type !== 'STOCKPILE' || !zone.storage) continue;
    for (const foodSrc of NPC_FOOD_SOURCES) {
      if ((zone.storage.items[foodSrc.material] || 0) > 0) {
        ctx.host.consumeFromStockpile(zone.id, foodSrc.material, 1);
        return foodSrc;
      }
    }
  }
  const mats = ctx.inventory?.materials;
  if (mats) {
    for (const foodSrc of NPC_FOOD_SOURCES) {
      if ((mats[foodSrc.material] || 0) >= 1) {
        ctx.host.removeMaterial(foodSrc.material, 1);
        return foodSrc;
      }
    }
  }
  return null;
}

/** Park the NPC's current task so tryResumeTask can pick it up again. */
function suspendTask(npc, updates) {
  updates.savedTaskId = npc.currentTaskId;
  updates.savedWorkTimer = npc.workTimer || 0;
  updates.savedHaulPhase = npc.haulPhase || null;
  updates.savedCarryingItem = npc.carryingItem || null;
  if (npc.currentTaskId) releaseTask(npc.currentTaskId);
  updates.currentTaskId = null;
  updates.stateTimer = 0;
  updates.workTimer = 0;
  updates.targetPosition = null;
}

/**
 * Interrupt a working NPC whose hunger or rest is critical.
 * A hungry NPC with no food available keeps working (and is not put to sleep).
 *
 * @returns {boolean} True if the NPC left its work state
 */
export function checkNeedsInterrupt(npc, newHunger, newRest, updates, ctx) {
  if (newHunger < NPC_HUNGER_CRITICAL) {
    const food = takeFood(ctx);
    if (!food) return false;
    suspendTask(npc, updates);
    updates.state = 'EATING';
    updates.eatingRestore = food.restore;
    updates.thoughtBubble = { type: 'hungry', timer: NPC_THOUGHT_DURATION };
    return true;
  }
  if (newRest < NPC_REST_CRITICAL) {
    goToSleep(npc, updates, ctx);
    return true;
  }
  return false;
}

/** Head to bed: park any task (resumed on waking) and walk to the sleep spot. */
export function goToSleep(npc, updates, ctx) {
  suspendTask(npc, updates);
  updates.state = 'SLEEPING';
  updates.targetPosition = getSleepTarget(npc, ctx);
  updates.thoughtBubble = { type: 'sleeping', timer: NPC_THOUGHT_DURATION };
}

/**
 * After eating/sleeping, go back to the task that was interrupted if it still
 * exists and nobody else took it. Always clears the saved-task fields.
 */
export function tryResumeTask(npc, updates) {
  const savedId = npc.savedTaskId;
  if (!savedId) return;

  const task = getTask(savedId);
  if (task && !task.claimedBy) {
    if (claimTask(savedId, npc.id)) {
      updates.state = workStateFor(task);
      updates.stateTimer = 0;
      updates.currentTaskId = savedId;
      updates.workTimer = npc.savedWorkTimer || 0;
      updates.targetPosition = [...task.position];
      if (task.type === 'HAUL' && npc.savedHaulPhase) {
        updates.haulPhase = npc.savedHaulPhase;
        updates.carryingItem = npc.savedCarryingItem || null;
        if (npc.savedHaulPhase === 'deliver' && task._sitePosition) {
          updates.targetPosition = [...task._sitePosition];
        }
      }
      updates.thoughtBubble = { type: thoughtFor(task), timer: NPC_THOUGHT_DURATION };
    }
  }
  updates.savedTaskId = null;
  updates.savedWorkTimer = 0;
  updates.savedHaulPhase = null;
  updates.savedCarryingItem = null;
}

/**
 * Claim the best available task for an idle NPC.
 * @returns {boolean} True if the NPC started working
 */
export function tryStartWork(npc, updates) {
  const task = findBestTask(npc);
  if (!task || !claimTask(task.id, npc.id)) return false;

  updates.state = workStateFor(task);
  updates.stateTimer = 0;
  updates.currentTaskId = task.id;
  updates.workTimer = 0;
  updates.targetPosition = [...task.position];
  if (task.type === 'HAUL') {
    updates.haulPhase = 'pickup';
    updates.carryingItem = null;
  }
  updates.thoughtBubble = { type: thoughtFor(task), timer: NPC_THOUGHT_DURATION };
  return true;
}

/** Stop caring about a task (used when an NPC leaves the settlement). */
export function abandonTask(npc, updates) {
  if (npc.currentTaskId) releaseTask(npc.currentTaskId);
  updates.currentTaskId = null;
}

function goIdle(updates) {
  updates.state = 'IDLE';
  updates.stateTimer = 0;
  updates.currentTaskId = null;
  updates.workTimer = 0;
  updates.targetPosition = null;
}

function goIdleFromHaul(updates) {
  goIdle(updates);
  updates.carryingItem = null;
  updates.haulPhase = null;
}

/** Put mined drops in the first stockpile with free space, else the player's inventory. */
function depositDrops(drops, ctx) {
  const { host } = ctx;
  // Fresh zones: an earlier NPC in this same tick may have filled a stockpile.
  for (const zone of host.getZones()) {
    if (zone.type !== 'STOCKPILE' || !zone.storage) continue;
    if (zone.storage.capacity - zone.storage.usedCapacity <= 0) continue;
    for (const drop of drops) {
      const freshZone = host.getZones().find((z) => z.id === zone.id);
      if (!freshZone?.storage) continue;
      const newItems = { ...freshZone.storage.items };
      newItems[drop.material] = (newItems[drop.material] || 0) + drop.amount;
      host.updateZone(zone.id, {
        storage: {
          ...freshZone.storage,
          items: newItems,
          usedCapacity: freshZone.storage.usedCapacity + drop.amount,
        },
      });
    }
    return;
  }
  for (const drop of drops) {
    host.addMaterial(drop.material, drop.amount);
  }
}

/** Mark the zone's mining task done and rescan the zone for newly exposed blocks. */
function refreshMiningZone(task, ctx) {
  if (!task.zoneId) return;
  const zone = ctx.zones.find((z) => z.id === task.zoneId);
  if (!zone?.miningTasks) return;

  const newTasks = [...zone.miningTasks];
  if (task._miningTaskIndex !== undefined && newTasks[task._miningTaskIndex]) {
    newTasks[task._miningTaskIndex] = { ...newTasks[task._miningTaskIndex], status: 'done' };
  }
  const rescanned = scanMiningZone(zone.bounds, ctx.chunkAdapter);
  const done = newTasks.filter((t) => t.status === 'done');
  const donePositions = new Set(done.map((t) => `${t.wx},${t.wy},${t.wz}`));
  const merged = [
    ...done,
    ...rescanned.filter((t) => !donePositions.has(`${t.wx},${t.wy},${t.wz}`)),
  ];
  ctx.host.updateZone(zone.id, { miningTasks: merged });
}

/** @returns {boolean} True if a task was completed (triggers an immediate task rescan) */
function tickMine(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdle(updates);
    return false;
  }

  if (distanceTo(npc, task.position) > NPC_WORK_RANGE) {
    // Still walking — SettlerNPC handles movement
    updates.targetPosition = [...task.position];
    return false;
  }

  const miningSkill = npc.skills?.mining || NPC_WORK_SKILL_FALLBACK;
  const adjustedDuration = NPC_MINE_DURATION / miningSkill;
  const wt = (npc.workTimer || 0) + tickDelta;
  updates.workTimer = wt;
  if (wt < adjustedDuration) return false;

  const [bx, by, bz] = task.position;
  const blockType = ctx.chunkAdapter.getBlock(bx, by, bz);
  if (blockType && blockType !== BlockTypes.AIR) {
    ctx.chunkAdapter.setBlock(bx, by, bz, BlockTypes.AIR);
    depositDrops(calculateDrops(blockType, NPC_MINE_TOOL_TIER), ctx);
  }

  refreshMiningZone(task, ctx);

  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'mining');
  goIdle(updates);
  return true;
}

/** @returns {boolean} True if a task was completed */
function tickHaul(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdleFromHaul(updates);
    return false;
  }

  const phase = npc.haulPhase || 'pickup';

  if (phase === 'pickup') {
    if (distanceTo(npc, task.position) > NPC_WORK_RANGE) {
      updates.targetPosition = [...task.position];
      return false;
    }

    // At the stockpile — pick up materials
    const zone = ctx.zones.find((z) => z.id === task.zoneId);
    if (!zone?.storage) return false;

    const stored = zone.storage.items[task.material] || 0;
    const toTake = Math.min(task.amount, stored);
    if (toTake > 0) {
      ctx.host.consumeFromStockpile(zone.id, task.material, toTake);
      updates.carryingItem = { material: task.material, amount: toTake };
      updates.haulPhase = 'deliver';
      if (task._sitePosition) {
        updates.targetPosition = [...task._sitePosition];
      }
      return false;
    }

    // Nothing to pick up — abandon (work timer is left as it was)
    completeTask(npc.currentTaskId);
    updates.state = 'IDLE';
    updates.stateTimer = 0;
    updates.currentTaskId = null;
    updates.carryingItem = null;
    updates.haulPhase = null;
    updates.targetPosition = null;
    return true;
  }

  // Deliver phase — walk to the construction site
  const sitePos = task._sitePosition || task.position;
  if (distanceTo(npc, sitePos) > NPC_WORK_RANGE) {
    updates.targetPosition = [sitePos[0], sitePos[1], sitePos[2]];
    return false;
  }

  const carrying = npc.carryingItem;
  if (carrying && task.siteId) {
    ctx.host.npcDeliverToConstruction(task.siteId, carrying.material, carrying.amount);
  }

  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'gathering');
  goIdleFromHaul(updates);
  return true;
}

/** @returns {boolean} True if a task was completed */
function tickBuild(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdle(updates);
    return false;
  }

  const site = ctx.constructionSites.find((s) => s.id === task.siteId);
  if (!site || site.status === 'COMPLETE') {
    completeTask(npc.currentTaskId);
    goIdle(updates);
    return true;
  }

  if (distanceTo(npc, task.position) > NPC_WORK_RANGE) {
    updates.targetPosition = [...task.position];
    return false;
  }

  // Site not ready yet (still PLACED)
  if (site.status !== 'BUILDING') return false;

  const buildSkill = npc.skills?.building || NPC_WORK_SKILL_FALLBACK;
  const adjustedDuration = NPC_BUILD_DURATION / buildSkill;
  const wt = (npc.workTimer || 0) + tickDelta;
  updates.workTimer = wt;
  if (wt < adjustedDuration) return false;

  ctx.host.advanceConstruction(site.id);
  updates.workTimer = 0;

  // `site` is the tick-start snapshot, so count the block just placed by hand.
  if (site.blocksPlaced + 1 < site.totalBlocks) return false;

  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'building');
  updates.state = 'IDLE';
  updates.stateTimer = 0;
  updates.currentTaskId = null;
  updates.targetPosition = null;
  ctx.host.addPickupText('Building complete!', '#44ff44');
  return true;
}

const WORK_STATE_TICKERS = {
  WORKING_MINE: tickMine,
  WORKING_HAUL: tickHaul,
  WORKING_BUILD: tickBuild,
};

/** @returns {boolean} Whether `state` is a work state handled by tickWorkState */
export function isWorkState(state) {
  return WORK_STATE_TICKERS[state] !== undefined;
}

/**
 * Tick an NPC that is in a WORKING_* state.
 *
 * @param {Object} npc - NPC as of the start of the tick
 * @param {number} tickDelta - Seconds since the last needs tick
 * @param {number} newHunger - Hunger after this tick's decay
 * @param {number} newRest - Rest after this tick's decay
 * @param {Object} updates - Pending updates for this NPC (mutated)
 * @param {Object} ctx - { zones, constructionSites, inventory, chunkAdapter, host }
 * @returns {boolean} True if a task was completed
 */
export function tickWorkState(npc, tickDelta, newHunger, newRest, updates, ctx) {
  if (checkNeedsInterrupt(npc, newHunger, newRest, updates, ctx)) return false;
  return WORK_STATE_TICKERS[npc.state](npc, tickDelta, updates, ctx);
}
