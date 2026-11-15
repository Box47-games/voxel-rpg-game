/**
 * devActions.js — Cheats and world controls used by the dev overlay.
 * Plain functions over the game store so they can be unit tested.
 */

import useGameStore from '../../stores/useGameStore';
import {
  DAY_LENGTH_SECONDS,
  NPC_INITIAL_HUNGER,
  NPC_INITIAL_REST,
  NPC_INITIAL_SOCIAL,
  NPC_INITIAL_HAPPINESS,
} from '../../data/tuning';
import { generateNPCIdentity } from '../../data/npcIdentity';
import { MONSTER_TYPES } from '../../systems/survival/RiftManager';
import { game3DSaveManager } from '../../persistence/Game3DSaveManager';

export const DEV_SAVE_SLOT = 'dev-quicksave';

const DEV_MATERIALS = [
  'wood', 'stone', 'dirt', 'sand', 'clay', 'coal', 'iron', 'gold_ore',
  'snow', 'ice', 'berry', 'vegetable', 'meat', 'fiber', 'leather', 'bone', 'crystal',
];

let _devEnemyCounter = 0;

const store = () => useGameStore.getState();

/** Restore health, mana, stamina and hunger to full. */
export function healFull() {
  const s = store();
  s.updatePlayer({
    health: s.player.maxHealth,
    mana: s.player.maxMana,
    stamina: s.player.maxStamina,
  });
  s.updateHunger({ current: s.hunger.max, isStarving: false, status: 'well_fed' });
}

export function setGodMode(enabled) {
  store().setDevGodMode(enabled);
}

/** Add `amount` of every common material. */
export function giveMaterials(amount = 50) {
  const s = store();
  for (const mat of DEV_MATERIALS) s.addMaterial(mat, amount);
}

export function giveXP(amount = 500) {
  store().addXP(amount);
}

export function teleportTo(position) {
  if (!position) return false;
  store().teleportPlayer(position);
  return true;
}

/** Teleport above the settlement campfire, if there is one. */
export function teleportToSettlement() {
  const c = store().settlement.settlementCenter;
  return c ? teleportTo([c[0] + 3, c[1] + 6, c[2] + 3]) : false;
}

/** Teleport next to the nearest rift (drops in from above). */
export function teleportToNearestRift() {
  const s = store();
  const p = s.player.position;
  let best = null;
  let bestD = Infinity;
  for (const r of s.rifts) {
    const d = (r.x - p[0]) ** 2 + (r.z - p[2]) ** 2;
    if (d < bestD) {
      bestD = d;
      best = r;
    }
  }
  return best ? teleportTo([best.x + 8, 70, best.z + 8]) : false;
}

export function teleportToSpawn() {
  return teleportTo([0, 70, 0]);
}

/** Kill every live enemy through its registered hit handler. */
export function killAllEnemies() {
  const handlers = store()._enemyHandlers;
  let killed = 0;
  for (const handler of handlers.values()) {
    handler.takeDamage(1e9);
    killed++;
  }
  return killed;
}

/** A rift monster record of `type` at `position`, as RiftManager makes them. */
function makeEnemy(type, id, position) {
  const t = MONSTER_TYPES[type];
  return {
    id, type, name: t.name, health: t.health, maxHealth: t.health,
    damage: t.damage, speed: t.speed, color: t.color, xp: t.xp, position,
  };
}

/** Spawn a rift monster of `type` a few units in front of the player. */
export function spawnEnemy(type = 'slime') {
  if (!MONSTER_TYPES[type]) return null;
  const s = store();
  const p = s.player.position;
  const yaw = s.player.facingAngle || 0;
  const id = `dev_${type}_${Date.now()}_${++_devEnemyCounter}`;
  s.addRiftEnemy(makeEnemy(type, id, [p[0] + Math.sin(yaw) * 6, p[1] + 3, p[2] + Math.cos(yaw) * 6]));
  return id;
}

const STRESS_PREFIX = 'stress_';

/**
 * Phase 3 raid load for performance checks: `enemies` rift monsters in a ring
 * 15–25 units around the player (all four types), and `settlers` walking
 * across the ring. Remove them with clearStressTest().
 * @returns {{ enemies: number, settlers: number }} How many were added
 */
export function spawnStressTest({ enemies = 25, settlers = 8 } = {}) {
  const s = store();
  const [px, py, pz] = s.player.position;
  const types = Object.keys(MONSTER_TYPES);
  const stamp = Date.now();
  for (let i = 0; i < enemies; i++) {
    const a = (i / Math.max(1, enemies)) * Math.PI * 2;
    const r = 15 + (i % 3) * 5;
    const type = types[i % types.length];
    s.addRiftEnemy(makeEnemy(type, `${STRESS_PREFIX}${type}_${stamp}_${i}`,
      [px + Math.cos(a) * r, py + 3, pz + Math.sin(a) * r]));
  }
  for (let i = 0; i < settlers; i++) {
    const a = (i / Math.max(1, settlers)) * Math.PI * 2;
    const from = [px + Math.cos(a) * 10, py + 2, pz + Math.sin(a) * 10];
    s.addSettlementNPC({
      id: `${STRESS_PREFIX}npc_${stamp}_${i}`,
      ...generateNPCIdentity(stamp + i * 7919),
      position: from,
      targetPosition: [px - Math.cos(a) * 10, py, pz - Math.sin(a) * 10],
      facingAngle: 0,
      state: 'WANDERING',
      stateTimer: 0,
      hunger: NPC_INITIAL_HUNGER,
      rest: NPC_INITIAL_REST,
      social: NPC_INITIAL_SOCIAL,
      happiness: NPC_INITIAL_HAPPINESS,
      unhappyDays: 0,
      dayCheckpoint: s.worldTime.elapsed,
      currentJob: null,
      arrivedAtSettlement: true,
    });
  }
  return { enemies, settlers };
}

/** Remove everything spawnStressTest() added. @returns {number} How many */
export function clearStressTest() {
  const s = store();
  const enemyIds = s.enemies.filter((e) => e.id.startsWith(STRESS_PREFIX)).map((e) => e.id);
  const npcIds = s.settlement.npcs.filter((n) => n.id.startsWith(STRESS_PREFIX)).map((n) => n.id);
  enemyIds.forEach((id) => s.removeRiftEnemy(id));
  npcIds.forEach((id) => s.removeSettlementNPC(id));
  return enemyIds.length + npcIds.length;
}

/** Remove transient effects (projectiles, particles, numbers, loot). */
export function clearEffects() {
  useGameStore.setState({
    projectiles: [],
    particleEffects: [],
    damageNumbers: [],
    targetMarkers: [],
    lootDrops: [],
    xpOrbs: [],
    pickupTexts: [],
  });
}

export function setTimeScale(scale) {
  store().setTimeScale(scale);
}

/** Jump to `hour` (0–24) on the current in-game day. */
export function jumpToHour(hour) {
  const s = store();
  const day = Math.max(1, s.worldTime.dayNumber || 1);
  const elapsed = (day - 1) * DAY_LENGTH_SECONDS + (hour / 24) * DAY_LENGTH_SECONDS;
  s.updateWorldTime({ elapsed });
}

export function quickSave() {
  const s = store();
  return game3DSaveManager.saveGame(useGameStore, s._chunkManager, DEV_SAVE_SLOT);
}

export function quickLoad() {
  const s = store();
  return game3DSaveManager.loadGame(useGameStore, s._chunkManager, DEV_SAVE_SLOT);
}

export { MONSTER_TYPES };
