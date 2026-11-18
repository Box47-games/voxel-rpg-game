/**
 * gathering.js — Should settlers fell trees or forage right now, and which?
 * Pure: SettlementModule calls it with the latest GatherScanner results and
 * hands the answer to scanForTasks.
 *
 *  - Wood: fell while a site is waiting on more wood than the stockpiles
 *    hold ('site'), or while stocked wood is below GATHER_WOOD_TARGET
 *    ('stock').
 *  - Food: forage while stocked food is below GATHER_FOOD_TARGET, or farms
 *    have more empty tiles than there are seeds (bushes drop seeds).
 *  - Seeds to plant: stockpiles plus the player's bag (settlers take from
 *    both, like food).
 */

import {
  GATHER_WOOD_TARGET,
  GATHER_FOOD_TARGET,
  GATHER_MAX_TREES,
  GATHER_MAX_BUSHES,
  NPC_FOOD_SOURCES,
  SEED_MATERIAL,
} from '../../data/tuning.js';

/** Total of a material across all stockpiles. */
export function stocked(zones, material) {
  let n = 0;
  for (const z of zones || []) {
    if (z.type === 'STOCKPILE' && z.storage) n += z.storage.items?.[material] || 0;
  }
  return n;
}

/**
 * @param {{ zones, constructionSites, inventory, scan: { trees, bushes } }} p
 * @returns {{ trees, bushes, needWood: 'site'|'stock'|false, needFood: boolean, seeds: number }}
 */
export function assessGather({ zones, constructionSites, inventory, scan }) {
  const wood = stocked(zones, 'wood');
  let siteWood = 0;
  for (const site of constructionSites || []) {
    if (site.status !== 'PLACED') continue;
    siteWood += Math.max(0, (site.materialsRequired?.wood || 0) - (site.materialsDelivered?.wood || 0));
  }
  const needWood = siteWood > wood ? 'site' : wood < GATHER_WOOD_TARGET ? 'stock' : false;

  const food = NPC_FOOD_SOURCES.reduce((n, f) => n + stocked(zones, f.material), 0);
  const seeds = stocked(zones, SEED_MATERIAL) + (inventory?.materials?.[SEED_MATERIAL] || 0);
  let emptyTiles = 0;
  for (const z of zones || []) {
    if (z.type === 'FARMING') emptyTiles += (z.farmTiles || []).filter((t) => t.plantedAt == null).length;
  }
  const needFood = food < GATHER_FOOD_TARGET || emptyTiles > seeds;

  return {
    trees: (scan?.trees || []).slice(0, GATHER_MAX_TREES),
    bushes: (scan?.bushes || []).slice(0, GATHER_MAX_BUSHES),
    needWood,
    needFood,
    seeds,
  };
}
