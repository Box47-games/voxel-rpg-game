/**
 * settlementSummary.js — Read-only summaries of the settlement for the
 * dashboard: population, resources, buildings and alerts. Pure functions of
 * store state, so they can be unit-tested and computed on a timer.
 */

import { getBuildingById } from '../../data/buildings.js';
import { getHomes, getTotalBeds, getPopulationCap, isSettled } from './housing.js';
import {
  IMMIGRATION_THRESHOLD,
  IMMIGRATION_THRESHOLD_PER_NPC,
  IMMIGRATION_MAX_NPCS,
  NPC_HUNGER_CRITICAL,
  NPC_LEAVE_WARNING_DAYS,
  NPC_LEAVE_DEPARTURE_DAYS,
  NPC_FOOD_SOURCES,
} from '../../data/tuning.js';

const FOOD = new Set(NPC_FOOD_SOURCES.map((f) => f.material));

/** What's stopping (or allowing) the next settler. */
export function getImmigrationStatus(settlement, cap) {
  if (!settlement.settlementCenter) return 'Place a campfire to found a settlement';
  const count = settlement.npcs.length;
  if (count >= cap) {
    return cap >= IMMIGRATION_MAX_NPCS
      ? 'The settlement is full'
      : 'Out of beds: build a Shelter or House for more settlers';
  }
  const needed = IMMIGRATION_THRESHOLD + count * IMMIGRATION_THRESHOLD_PER_NPC;
  if ((settlement.attractiveness || 0) < needed) {
    return `Not attractive enough yet (${Math.round(settlement.attractiveness || 0)} / ${needed})`;
  }
  return 'A new settler may arrive soon';
}

export function summarizePopulation(settlement, constructionSites) {
  const homes = getHomes(constructionSites);
  const cap = getPopulationCap(homes);
  const settled = settlement.npcs.filter(isSettled);
  const avgHappiness = settled.length
    ? settled.reduce((sum, n) => sum + (n.happiness || 0), 0) / settled.length
    : null;
  return {
    count: settlement.npcs.length,
    settled: settled.length,
    arriving: settlement.npcs.length - settled.length,
    cap,
    beds: getTotalBeds(homes),
    homeless: settled.filter((n) => !n.homeId).length,
    avgHappiness,
    immigration: getImmigrationStatus(settlement, cap),
  };
}

/** Stockpile contents (all stockpiles together), largest first. */
export function summarizeResources(zones) {
  const totals = {};
  let used = 0;
  let capacity = 0;
  let stockpiles = 0;
  for (const zone of zones) {
    if (zone.type !== 'STOCKPILE' || !zone.storage) continue;
    stockpiles++;
    used += zone.storage.usedCapacity || 0;
    capacity += zone.storage.capacity || 0;
    for (const [material, amount] of Object.entries(zone.storage.items || {})) {
      if (amount > 0) totals[material] = (totals[material] || 0) + amount;
    }
  }
  const items = Object.entries(totals)
    .map(([material, amount]) => ({ material, amount, isFood: FOOD.has(material) }))
    .sort((a, b) => b.amount - a.amount || a.material.localeCompare(b.material));
  const food = items.filter((i) => i.isFood).reduce((sum, i) => sum + i.amount, 0);
  return { items, food, used, capacity, stockpiles };
}

/** What a construction site still needs that isn't delivered. */
function missingMaterials(site) {
  const missing = {};
  for (const [mat, required] of Object.entries(site.materialsRequired || {})) {
    const left = required - (site.materialsDelivered?.[mat] || 0);
    if (left > 0) missing[mat] = left;
  }
  return missing;
}

export function summarizeBuildings(constructionSites) {
  const completed = {};
  const inProgress = [];
  for (const site of constructionSites) {
    const built = getBuildingById(site.buildingId)?.name || site.buildingId;
    const from = site.upgradeFrom && site.status !== 'COMPLETE' ? getBuildingById(site.upgradeFrom)?.name : null;
    const name = from ? `${built} (upgrading the ${from})` : built;
    if (site.status === 'COMPLETE') {
      completed[name] = (completed[name] || 0) + 1;
    } else {
      const progress = site.status === 'BUILDING' && site.totalBlocks
        ? site.blocksPlaced / site.totalBlocks
        : 0;
      inProgress.push({ id: site.id, name, status: site.status, progress, missing: missingMaterials(site) });
    }
  }
  return {
    completed: Object.entries(completed).map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    inProgress,
  };
}

/**
 * Problems that need the player's attention, most urgent first.
 * @returns {Array<{ level: 'danger'|'warning'|'info', text: string }>}
 */
export function getAlerts({ settlement, zones, constructionSites }) {
  const alerts = [];
  if (!settlement.settlementCenter) return alerts;
  const settled = settlement.npcs.filter(isSettled);

  for (const npc of settled) {
    if ((npc.unhappyDays || 0) >= NPC_LEAVE_WARNING_DAYS) {
      const days = Math.max(0, NPC_LEAVE_DEPARTURE_DAYS - npc.unhappyDays);
      alerts.push({
        level: 'danger',
        text: days > 0
          ? `${npc.fullName} is unhappy and may leave in ${days} day${days === 1 ? '' : 's'}`
          : `${npc.fullName} is about to leave`,
      });
    }
  }

  const resources = summarizeResources(zones);
  const hungry = settled.filter((n) => (n.hunger ?? 100) < NPC_HUNGER_CRITICAL);
  if (hungry.length > 0) {
    alerts.push({
      level: resources.food === 0 ? 'danger' : 'warning',
      text: `${hungry.length} settler${hungry.length === 1 ? ' is' : 's are'} starving`
        + (resources.food === 0 ? ' and the stockpiles have no food' : ''),
    });
  } else if (settled.length > 0 && resources.food === 0) {
    alerts.push({ level: 'warning', text: 'No food in the stockpiles: forage berries or start a farm' });
  }

  const homeless = settled.filter((n) => !n.homeId).length;
  if (homeless > 0) {
    alerts.push({
      level: 'warning',
      text: `${homeless} settler${homeless === 1 ? ' is' : 's are'} homeless (sleeping by the campfire, less happy)`,
    });
  }

  if (resources.stockpiles === 0 && settled.length > 0) {
    alerts.push({ level: 'info', text: 'No stockpile yet: settlers put what they gather in your inventory' });
  } else if (resources.capacity > 0 && resources.used >= resources.capacity) {
    alerts.push({ level: 'warning', text: 'Stockpiles are full' });
  }

  for (const site of summarizeBuildings(constructionSites).inProgress) {
    if (site.status !== 'PLACED') continue;
    const missing = Object.entries(site.missing);
    if (missing.length === 0) continue;
    const list = missing.map(([mat, n]) => `${n} ${mat.replace(/_/g, ' ')}`).join(', ');
    alerts.push({ level: 'info', text: `${site.name} is waiting for ${list}` });
  }

  const rank = { danger: 0, warning: 1, info: 2 };
  return alerts.sort((a, b) => rank[a.level] - rank[b.level]);
}
