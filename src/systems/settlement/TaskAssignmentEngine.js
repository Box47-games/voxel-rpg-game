/**
 * TaskAssignmentEngine — Ephemeral task registry for NPC work.
 *
 * Module-level singleton Map<taskId, Task> — NOT stored in Zustand.
 * Rebuilt from zone/construction state every WORK_SCAN_INTERVAL.
 *
 * Task types: MINE, HAUL, BUILD, FARM (plant or harvest one farm tile),
 * CHOP (fell a tree near camp) and FORAGE (pick a berry bush near camp)
 */

import {
  NPC_SKILL_WEIGHT,
  NPC_DISTANCE_WEIGHT,
  NPC_PRIORITY_WEIGHT,
  NPC_JOB_PREF_BONUS,
  MAX_FARMERS_PER_ZONE,
} from '../../data/tuning';
import { getActiveFarms, getTileStage, TileStage } from '../../modules/settlement/farming';
import { PIECES, BLOCK_UNITS } from '../../data/pieces';

/**
 * Where to haul `needed` blocks of `mat` from: { zone, key, amount } or null.
 * Pieces first (up to what is needed, rounded up to a whole piece), then whole
 * blocks (at least one; npcDeliverToConstruction returns the change).
 */
export function findHaulSource(stockpiles, mat, needed) {
  const piece = PIECES[mat];
  if (piece) {
    for (const zone of stockpiles) {
      const stored = zone.storage.items[piece.key] || 0;
      if (stored > 0) {
        const want = Math.ceil((needed * BLOCK_UNITS) / piece.units - 1e-9);
        return { zone, key: piece.key, amount: Math.min(stored, Math.max(1, want)) };
      }
    }
  }
  for (const zone of stockpiles) {
    const stored = zone.storage.items[mat] || 0;
    if (stored > 0) return { zone, key: mat, amount: Math.min(stored, Math.max(1, Math.ceil(needed - 1e-9))) };
  }
  return null;
}

// ── Task Registry (module-level singleton) ──
const _tasks = new Map();
// Trees/bushes a settler couldn't reach: key → world time until which they're skipped
const _avoid = new Map();
let _nextTaskId = 0;

function makeTaskId() {
  return `task_${++_nextTaskId}`;
}

// ── Skill mapping ──
const TASK_SKILL = {
  MINE: 'mining',
  HAUL: 'gathering',
  BUILD: 'building',
  FARM: 'gathering',
  CHOP: 'gathering',
  FORAGE: 'gathering',
};

const TASK_JOB = {
  MINE: 'miner',
  HAUL: 'gatherer',
  BUILD: 'builder',
  FARM: 'farmer',
  CHOP: 'gatherer',
  FORAGE: 'gatherer',
};

/**
 * Rebuild the task list from current zone + construction state.
 * Farm tasks need the world time (crop growth); without it they are skipped.
 * `gather` (from SettlementModule) adds felling and foraging near camp and
 * says how many seeds there are to plant:
 *   { trees, bushes, needWood, needFood, seeds }
 * Without it planting is free (older callers and tests).
 */
export function scanForTasks(zones, constructionSites, chunkManager, worldTimeElapsed, gather = null) {
  // Keep track of existing claimed tasks so we don't lose assignments
  const claimedTasks = new Map();
  for (const [id, task] of _tasks) {
    if (task.claimedBy) {
      claimedTasks.set(taskKey(task), { id, claimedBy: task.claimedBy });
    }
  }

  _tasks.clear();

  // ── MINE tasks: from MINING zones' miningTasks with status 'pending' ──
  for (const zone of zones) {
    if (zone.type !== 'MINING' || !zone.miningTasks) continue;
    for (let i = 0; i < zone.miningTasks.length; i++) {
      const mt = zone.miningTasks[i];
      if (mt.status !== 'pending') continue;
      // Verify block still exists
      if (chunkManager) {
        const block = chunkManager.getBlock(mt.wx, mt.wy, mt.wz);
        if (!block || block === 0) continue; // AIR = 0
      }
      const key = `MINE:${mt.wx},${mt.wy},${mt.wz}`;
      const existing = claimedTasks.get(key);
      const id = existing ? existing.id : makeTaskId();
      _tasks.set(id, {
        id,
        type: 'MINE',
        zoneId: zone.id,
        siteId: null,
        position: [mt.wx, mt.wy, mt.wz],
        blockType: mt.blockType,
        material: null,
        amount: 0,
        claimedBy: existing ? existing.claimedBy : null,
        priority: 1,
        _miningTaskIndex: i,
      });
    }
  }

  // ── HAUL tasks: construction sites needing materials from stockpiles ──
  const stockpiles = zones.filter(z => z.type === 'STOCKPILE' && z.storage);
  for (const site of constructionSites) {
    if (site.status !== 'PLACED') continue;
    for (const [mat, required] of Object.entries(site.materialsRequired)) {
      const delivered = site.materialsDelivered[mat] || 0;
      const needed = required - delivered;
      if (needed <= 0) continue;
      // A stockpile with this material: pieces first (planks, slabs, cubes count
      // by volume), whole blocks once a block or more is needed
      const source = findHaulSource(stockpiles, mat, needed);
      if (!source) continue;
      const { zone: sourceZone, key: haulKey, amount } = source;
      const cx = (sourceZone.bounds.minX + sourceZone.bounds.maxX) / 2;
      const cz = (sourceZone.bounds.minZ + sourceZone.bounds.maxZ) / 2;
      const key = `HAUL:${site.id}:${mat}`;
      const existing = claimedTasks.get(key);
      const id = existing ? existing.id : makeTaskId();
      _tasks.set(id, {
        id,
        type: 'HAUL',
        zoneId: sourceZone.id,
        siteId: site.id,
        position: [cx, site.position[1], cz],
        blockType: null,
        material: haulKey,
        amount,
        claimedBy: existing ? existing.claimedBy : null,
        priority: 2,
        _sitePosition: site.position,
      });
    }
  }

  // ── FARM tasks: plant empty tiles, harvest ripe ones ──
  if (worldTimeElapsed != null) {
    // Each planting uses a seed: no more PLANT tasks than seeds to hand
    let seedsLeft = gather ? gather.seeds : Infinity;
    for (const zone of getActiveFarms(zones, constructionSites)) {
      zone.farmTiles.forEach((tile, i) => {
        const stage = getTileStage(tile, worldTimeElapsed);
        if (stage === TileStage.GROWING) return;
        const farmAction = stage === TileStage.READY ? 'HARVEST' : 'PLANT';
        if (farmAction === 'PLANT') {
          if (seedsLeft <= 0) return;
          seedsLeft--;
        }
        const key = `FARM:${zone.id}:${i}:${farmAction}`;
        const existing = claimedTasks.get(key);
        const id = existing ? existing.id : makeTaskId();
        _tasks.set(id, {
          id,
          type: 'FARM',
          farmAction,
          zoneId: zone.id,
          siteId: null,
          position: [tile.x, tile.y, tile.z],
          blockType: null,
          material: null,
          amount: 0,
          claimedBy: existing ? existing.claimedBy : null,
          // Both above mining (1): a mine zone never runs out of work, and a
          // nearby one would otherwise keep settlers off the farm for good.
          priority: farmAction === 'HARVEST' ? 3 : 2,
          _tileIndex: i,
        });
      });
    }
  }

  // ── BUILD tasks: construction sites in BUILDING status ──
  for (const site of constructionSites) {
    if (site.status !== 'BUILDING') continue;
    const key = `BUILD:${site.id}`;
    const existing = claimedTasks.get(key);
    const id = existing ? existing.id : makeTaskId();
    _tasks.set(id, {
      id,
      type: 'BUILD',
      zoneId: null,
      siteId: site.id,
      position: [...site.position],
      blockType: null,
      material: null,
      amount: 0,
      claimedBy: existing ? existing.claimedBy : null,
      priority: 3,
    });
  }

  // ── CHOP / FORAGE: trees and berry bushes near camp, while stocks are low ──
  if (gather) {
    const add = (type, t, priority) => {
      const key = `${type}:${t.x},${t.y},${t.z}`;
      if ((_avoid.get(key) ?? -Infinity) > (worldTimeElapsed ?? 0)) return;
      const existing = claimedTasks.get(key);
      const id = existing ? existing.id : makeTaskId();
      _tasks.set(id, {
        id,
        type,
        zoneId: null,
        siteId: null,
        position: [t.x, t.y, t.z],
        blockType: null,
        material: null,
        amount: 0,
        claimedBy: existing ? existing.claimedBy : null,
        priority,
      });
    };
    // Wood a site is waiting on outranks mining; topping up stock doesn't
    if (gather.needWood) gather.trees.forEach((t) => add('CHOP', t, gather.needWood === 'site' ? 2 : 1.5));
    // Food (or seeds) running short: just behind harvesting crops
    // Food or seeds running short: after planting (2), before topping up wood
    if (gather.needFood) gather.bushes.forEach((b) => add('FORAGE', b, 1.8));
  }
}

/** Generate a dedup key for preserving claims across scans */
function taskKey(task) {
  if (task.type === 'MINE') return `MINE:${task.position[0]},${task.position[1]},${task.position[2]}`;
  if (task.type === 'HAUL') return `HAUL:${task.siteId}:${task.material}`;
  if (task.type === 'BUILD') return `BUILD:${task.siteId}`;
  if (task.type === 'FARM') return `FARM:${task.zoneId}:${task._tileIndex}:${task.farmAction}`;
  if (task.type === 'CHOP' || task.type === 'FORAGE') return `${task.type}:${task.position[0]},${task.position[1]},${task.position[2]}`;
  return task.id;
}

/**
 * Score and return the best unclaimed task for an NPC.
 */
export function findBestTask(npc) {
  let bestTask = null;
  let bestScore = -Infinity;

  const npcPos = npc.position || [0, 0, 0];
  const npcSkills = npc.skills || {};
  const npcJob = npc.preferredJob || '';
  const farmers = countFarmersByZone();

  for (const task of _tasks.values()) {
    if (task.claimedBy) continue;
    if (task.type === 'FARM' && (farmers.get(task.zoneId) || 0) >= MAX_FARMERS_PER_ZONE) continue;

    const requiredSkill = TASK_SKILL[task.type] || 'gathering';
    const skillMatch = npcSkills[requiredSkill] || 0.3;
    const jobPrefMatch = TASK_JOB[task.type] === npcJob;

    const dx = (task.position[0] || 0) - (npcPos[0] || 0);
    const dz = (task.position[2] || 0) - (npcPos[2] || 0);
    const distance = Math.sqrt(dx * dx + dz * dz);

    const score =
      skillMatch * NPC_SKILL_WEIGHT +
      task.priority * NPC_PRIORITY_WEIGHT -
      distance * NPC_DISTANCE_WEIGHT +
      (jobPrefMatch ? NPC_JOB_PREF_BONUS : 0);

    if (score > bestScore) {
      bestScore = score;
      bestTask = task;
    }
  }

  return bestTask;
}

/** Settlers currently working each farm zone (claimed FARM tasks). */
function countFarmersByZone() {
  const counts = new Map();
  for (const task of _tasks.values()) {
    if (task.type !== 'FARM' || !task.claimedBy) continue;
    counts.set(task.zoneId, (counts.get(task.zoneId) || 0) + 1);
  }
  return counts;
}

/** Whether any settler is farming this zone right now. */
export function isZoneBeingFarmed(zoneId) {
  return (countFarmersByZone().get(zoneId) || 0) > 0;
}

/**
 * Atomic claim. Returns true if successful.
 */
export function claimTask(taskId, npcId) {
  const task = _tasks.get(taskId);
  if (!task || task.claimedBy) return false;
  task.claimedBy = npcId;
  return true;
}

/**
 * Release a task claim (for interrupts).
 */
export function releaseTask(taskId) {
  const task = _tasks.get(taskId);
  if (task) task.claimedBy = null;
}

/**
 * Complete and remove a task.
 */
export function completeTask(taskId) {
  _tasks.delete(taskId);
}

/**
 * Look up a task by ID.
 */
export function getTask(taskId) {
  return _tasks.get(taskId) || null;
}

/**
 * Drop every task and claim (on load, and in tests). The next scanForTasks rebuilds the list.
 */
/** A settler couldn't reach this tree or bush: leave it alone until `until` (world time). */
export function avoidGatherTarget(task, until) {
  if (!task) return;
  _avoid.set(`${task.type}:${task.position[0]},${task.position[1]},${task.position[2]}`, until);
}

export function clearTasks() {
  _avoid.clear();
  _tasks.clear();
}

/**
 * Check if a construction site has an NPC working BUILD on it.
 */
export function siteHasNPCBuilder(siteId) {
  for (const task of _tasks.values()) {
    if (task.type === 'BUILD' && task.siteId === siteId && task.claimedBy) {
      return true;
    }
  }
  return false;
}
