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
import { BlockTypes } from '../../systems/chunks/blockTypes';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import { shapes as SHAPE, AXIS } from '../../systems/chunks/cellShape';

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

/**
 * Block pieces phase 2 test shapes: a row of shaped cells on the ground a few
 * blocks in front of the player (the facing snapped to the nearest axis), to
 * walk on and mine. Left to right: a floor slab, two slabs in one cell, a wall
 * slab, a plank over two cells, loose dirt cubes, a half layer of sand cubes,
 * and a slab staircase (slab, block, slab on the block).
 * @returns {number} cells placed
 */
export function placeTestShapes() {
  const s = store();
  const cm = s._chunkManager;
  if (!cm?.setCell) return 0;
  const p = s.player.position;
  const yaw = s.player.facingAngle || 0;
  // Forward and sideways, snapped to the grid axes
  const fx = Math.abs(Math.sin(yaw)) >= Math.abs(Math.cos(yaw)) ? Math.sign(Math.sin(yaw)) : 0;
  const fz = fx === 0 ? Math.sign(Math.cos(yaw)) || 1 : 0;
  const sx = -fz, sz = fx;
  const fwdAxis = fx !== 0 ? AXIS.X : AXIS.Z;
  const sideAxis = fx !== 0 ? AXIS.Z : AXIS.X;
  const cx = Math.floor(p[0] / VOXEL_SIZE);
  const cz = Math.floor(p[2] / VOXEL_SIZE);
  let placed = 0;

  // Cell (ahead, side) on the ground, `up` cells above the surface
  const put = (ahead, side, up, type, shape) => {
    const wx = (cx + fx * ahead + sx * side) * VOXEL_SIZE + VOXEL_SIZE / 2;
    const wz = (cz + fz * ahead + sz * side) * VOXEL_SIZE + VOXEL_SIZE / 2;
    const ground = cm.standingHeight ? cm.standingHeight(wx, wz, p[1] + VOXEL_SIZE * 2) : p[1];
    if (ground == null) return;
    const wy = (Math.ceil(ground / VOXEL_SIZE - 1e-6) + up) * VOXEL_SIZE + VOXEL_SIZE / 2;
    if (cm.setCell(wx, wy, wz, type, shape)) placed++;
  };
  // The plank's partner side: + when sideways points along the + axis
  const plus = (sideAxis === AXIS.X ? sx : sz) > 0;

  put(3, -6, 0, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
  put(3, -4, 0, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0, 1]));
  put(3, -2, 0, BlockTypes.STONE, SHAPE.slab(fwdAxis, [0]));
  put(3, 0, 0, BlockTypes.WOOD, SHAPE.plank(sideAxis, [0], plus));
  put(3, 1, 0, BlockTypes.WOOD, SHAPE.plank(sideAxis, [0], !plus));
  put(3, 3, 0, BlockTypes.DIRT, SHAPE.cubes(0b10010110));
  put(3, 5, 0, BlockTypes.SAND, SHAPE.cubes(0b00110011));
  // Staircase: slab, then a block with a slab on it
  put(3, 7, 0, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0]));
  put(4, 7, 0, BlockTypes.STONE, 0);
  put(4, 7, 0, BlockTypes.STONE, SHAPE.slab(AXIS.Y, [0])); // on top of the new block
  return placed;
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
