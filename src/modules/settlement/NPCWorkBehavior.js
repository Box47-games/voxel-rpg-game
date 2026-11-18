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
 * Seam for new work types (guard, ...): add a task type to the task
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
  avoidGatherTarget,
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
  FARM_PLANT_TIME,
  FARM_HARVEST_TIME,
  FARM_HARVEST_YIELD,
  FARM_CROP_MATERIAL,
  SCAFFOLD_REACH_LEVELS,
  SEED_MATERIAL,
  FARM_HARVEST_SEEDS,
  NPC_CHOP_DURATION,
  NPC_FORAGE_DURATION,
  GATHER_GIVE_UP_SECONDS,
  GATHER_AVOID_SECONDS,
} from '../../data/tuning';
import { BLOCK_USE_ACTIONS } from '../../data/blockUseActions';
import { fellTree } from '../../systems/settlement/GatherScanner';
import { getTileStage, TileStage, withTile } from './farming';
import { placeNextBlock, getNextBlock } from './buildingInfo';
import {
  getScaffoldRoute,
  projectOnRoute,
  pointOnRoute,
  nextWaypoint,
  alongAtHeight,
  getGroundRing,
  pointOnRing,
  ringGap,
  ringWaypoint,
} from '../../systems/construction/scaffoldRoute';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';

const WORK_STATE_BY_TASK_TYPE = {
  MINE: 'WORKING_MINE',
  HAUL: 'WORKING_HAUL',
  BUILD: 'WORKING_BUILD',
  FARM: 'WORKING_FARM',
  CHOP: 'WORKING_CHOP',
  FORAGE: 'WORKING_FORAGE',
};

const THOUGHT_BY_TASK_TYPE = {
  MINE: 'mining',
  HAUL: 'hauling',
  BUILD: 'building',
  FARM: 'farming',
  CHOP: 'chopping',
  FORAGE: 'foraging',
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

/**
 * Take one of `material` from a stockpile, else from the player's bag (as
 * with food). @returns {boolean} whether there was one
 */
export function takeMaterial(ctx, material) {
  for (const zone of ctx.zones) {
    if (zone.type !== 'STOCKPILE' || !zone.storage) continue;
    if ((zone.storage.items[material] || 0) > 0) {
      ctx.host.consumeFromStockpile(zone.id, material, 1);
      return true;
    }
  }
  if ((ctx.inventory?.materials?.[material] || 0) >= 1) {
    ctx.host.removeMaterial(material, 1);
    return true;
  }
  return false;
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

/** Put drops in the first stockpile with free space, else the player's inventory. */
export function depositDrops(drops, ctx) {
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

  // High blocks are built from the scaffolding ramp; the rest from the ground,
  // standing just outside the wall. Either way builders walk round the
  // outside of the footprint, never over the walls they're putting up.
  const high = site.status === 'BUILDING' && scaffoldTarget(site);
  const move = high ? scaffoldApproach(npc, high, site) : groundApproach(npc, site);
  if (move) {
    updates.targetPosition = move;
    return false;
  }
  updates.targetPosition = null; // in place: stand still and work

  // Site not ready yet (still PLACED)
  if (site.status !== 'BUILDING') return false;

  const buildSkill = npc.skills?.building || NPC_WORK_SKILL_FALLBACK;
  const adjustedDuration = NPC_BUILD_DURATION / buildSkill;
  const wt = (npc.workTimer || 0) + tickDelta;
  updates.workTimer = wt;
  if (wt < adjustedDuration) return false;

  // Put the block in the world, then count it (the count alone used to be all
  // a settler builder did, so settler-built buildings never appeared)
  placeNextBlock(site, ctx.chunkAdapter);
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

/** How close (along the ring) a builder must be to their spot to work. */
const BUILD_SPOT_TOLERANCE = 0.6;
/** Further than this from the ring line and a builder walks straight to it first. */
const RING_JOIN_DISTANCE = 0.6;

/**
 * Walk round the outside of the site to `goal` (along the ground ring), or
 * null once there. Someone off the ring (arriving, or up on a wall) heads
 * for the nearest point on it first.
 */
function walkRing(npc, site, goal) {
  const ring = getGroundRing(site);
  if (!ring) return null;
  const [x, , z] = npc.position;
  const p = projectOnRoute(ring, x, z);
  if (p.off > RING_JOIN_DISTANCE) return pointOnRing(ring, p.along);
  if (ringGap(ring, p.along, goal) <= BUILD_SPOT_TOLERANCE) return null;
  return ringWaypoint(ring, p.along, goal);
}

/** Where to walk to build the next low block (beside it, outside the wall), or null once there. */
function groundApproach(npc, site) {
  const ring = getGroundRing(site);
  const next = getNextBlock(site);
  if (!ring || !next) {
    // Nothing to place yet: just get near the site
    return distanceTo(npc, site.position) > NPC_WORK_RANGE ? [...site.position] : null;
  }
  return walkRing(npc, site, projectOnRoute(ring, next.x, next.z).along);
}

/**
 * Where a builder must walk to build from the scaffolding, or null once they
 * are in place. Settlers walk round the site to the foot of the ramp, then
 * climb it corner by corner to the spot where the walkway is one level below
 * the block.
 */
function scaffoldApproach(npc, { route, goal }, site) {
  const [x, y, z] = npc.position;
  const p = projectOnRoute(route, x, z);
  const onRamp = p.off <= route.width / 2 + 0.3 && Math.abs(p.y - (y ?? 0)) < 1.2;
  if (!onRamp) return walkRing(npc, site, 0) || pointOnRoute(route, Math.min(1, goal)); // the foot of the ramp
  if (Math.abs(p.along - goal) <= 1) return null; // in place
  return nextWaypoint(route, p.along, goal);
}

/** The route and the build spot along it, for a block too high to reach from the ground. */
function scaffoldTarget(site) {
  const next = getNextBlock(site);
  if (!next) return null;
  const level = Math.round((next.y - site.position[1] - VOXEL_SIZE / 2) / VOXEL_SIZE);
  if (level < SCAFFOLD_REACH_LEVELS) return null;
  const route = getScaffoldRoute(site);
  if (!route) return null;
  return { route, goal: alongAtHeight(route, next.y - VOXEL_SIZE * 1.5) };
}

/**
 * Plant an empty farm tile or harvest a ripe one. The tile is re-checked
 * against the live zone: if someone else got there first, the task just ends.
 * @returns {boolean} True if a task was completed
 */
function tickFarm(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdle(updates);
    return false;
  }

  if (distanceTo(npc, task.position) > NPC_WORK_RANGE) {
    updates.targetPosition = [...task.position];
    return false;
  }

  const harvesting = task.farmAction === 'HARVEST';
  const skill = npc.skills?.gathering || NPC_WORK_SKILL_FALLBACK;
  const duration = (harvesting ? FARM_HARVEST_TIME : FARM_PLANT_TIME) / skill;
  const wt = (npc.workTimer || 0) + tickDelta;
  updates.workTimer = wt;
  if (wt < duration) return false;

  const elapsed = ctx.worldTimeElapsed;
  const zone = ctx.host.getZones().find((z) => z.id === task.zoneId);
  const tile = zone?.farmTiles?.[task._tileIndex];
  if (tile) {
    const stage = getTileStage(tile, elapsed);
    if (harvesting && stage === TileStage.READY) {
      ctx.host.updateZone(zone.id, {
        farmTiles: withTile(zone.farmTiles, task._tileIndex, { plantedAt: null, collectedAt: null }),
      });
      const [sMin, sMax] = FARM_HARVEST_SEEDS;
      const seeds = sMin + Math.floor(Math.random() * (sMax - sMin + 1));
      depositDrops([
        { material: FARM_CROP_MATERIAL, amount: FARM_HARVEST_YIELD },
        ...(seeds > 0 ? [{ material: SEED_MATERIAL, amount: seeds }] : []),
      ], ctx);
    } else if (!harvesting && stage === TileStage.EMPTY && takeMaterial(ctx, SEED_MATERIAL)) {
      // Planting uses a seed (none left: the tile stays empty)
      ctx.host.updateZone(zone.id, {
        farmTiles: withTile(zone.farmTiles, task._tileIndex, { plantedAt: elapsed, collectedAt: null }),
      });
    }
  }

  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'gathering');
  goIdle(updates);
  return true;
}

/** Walk to a gather target; once there, work for `duration`. @returns {boolean|null} true when done, null to keep going */
function gatherStep(npc, tickDelta, updates, task, duration, ctx) {
  if ((npc.stateTimer || 0) > GATHER_GIVE_UP_SECONDS) {
    // Can't get there (a ledge, a wall): leave it for a while and do something else
    avoidGatherTarget(task, (ctx.worldTimeElapsed ?? 0) + GATHER_AVOID_SECONDS);
    releaseTask(npc.currentTaskId);
    goIdle(updates);
    return false;
  }
  if (distanceTo(npc, task.position) > NPC_WORK_RANGE) {
    updates.targetPosition = [...task.position];
    return null;
  }
  const wt = (npc.workTimer || 0) + tickDelta;
  updates.workTimer = wt;
  return wt >= duration / (npc.skills?.gathering || NPC_WORK_SKILL_FALLBACK) ? true : null;
}

/** Fell a tree near camp; its wood goes to the stockpile. @returns {boolean} task completed */
function tickChop(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdle(updates);
    return false;
  }
  if (!gatherStep(npc, tickDelta, updates, task, NPC_CHOP_DURATION, ctx)) return false;
  const [x, y, z] = task.position;
  const trunk = fellTree(ctx.chunkAdapter, x, y, z);
  const drops = [];
  for (let i = 0; i < trunk; i++) drops.push(...calculateDrops(BlockTypes.WOOD, NPC_MINE_TOOL_TIER));
  if (drops.length) depositDrops(drops, ctx);
  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'gathering');
  goIdle(updates);
  return true;
}

/** Pick a berry bush near camp: berries (and maybe seeds) to the stockpile. @returns {boolean} task completed */
function tickForage(npc, tickDelta, updates, ctx) {
  const task = getTask(npc.currentTaskId);
  if (!task) {
    goIdle(updates);
    return false;
  }
  if (!gatherStep(npc, tickDelta, updates, task, NPC_FORAGE_DURATION, ctx)) return false;
  const [x, y, z] = task.position;
  const type = ctx.chunkAdapter.getBlock(x, y, z);
  const action = BLOCK_USE_ACTIONS[type];
  if (action?.action === 'harvest') {
    const drops = [];
    for (const d of action.drops) {
      const amount = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
      if (amount > 0) drops.push({ material: d.material, amount });
    }
    if (action.destroyBlock) ctx.chunkAdapter.setBlock(x, y, z, BlockTypes.AIR);
    if (drops.length) depositDrops(drops, ctx);
  }
  completeTask(npc.currentTaskId);
  growSkill(npc, updates, 'gathering');
  goIdle(updates);
  return true;
}

const WORK_STATE_TICKERS = {
  WORKING_MINE: tickMine,
  WORKING_HAUL: tickHaul,
  WORKING_BUILD: tickBuild,
  WORKING_FARM: tickFarm,
  WORKING_CHOP: tickChop,
  WORKING_FORAGE: tickForage,
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
