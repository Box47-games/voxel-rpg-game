/**
 * gridPath.js — Walking paths over the voxel world for monsters, animals and
 * settlers (the player has its own click-to-move).
 *
 * The grid is voxel columns. Standing in a column means feet in an empty
 * voxel with a solid one under it and room for the head above. From one
 * column to the next a walker may step up NAV_MAX_STEP_UP blocks or drop
 * NAV_MAX_STEP_DOWN. A* over that (8 directions, no cutting corners), then the
 * path is straightened wherever a direct walk works.
 *
 * Searches are bounded (NAV_MAX_ITERATIONS, NAV_MAX_RANGE) and rationed per frame
 * (NAV_SEARCHES_PER_WINDOW): an agent that can't search this frame just
 * keeps going straight and asks again shortly.
 */

import { VOXEL_SIZE } from '../chunks/coordinates';
import { isSolid, BlockTypes } from '../chunks/blockTypes';
import {
  NAV_MAX_STEP_UP,
  NAV_MAX_STEP_DOWN as NAV_MAX_DROP,
  NAV_PLAYER_HEIGHT_VOXELS as NAV_HEADROOM,
  NAV_MAX_ITERATIONS as NAV_MAX_NODES,
  NAV_MAX_RANGE,
  NAV_SEARCHES_PER_WINDOW,
  NAV_SEARCH_WINDOW_MS,
} from '../../data/tuning';

const v = (w) => Math.floor(w / VOXEL_SIZE);
const c = (n) => n * VOXEL_SIZE + VOXEL_SIZE / 2;
const DIRS = [
  [1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1],
  [1, 1, Math.SQRT2], [1, -1, Math.SQRT2], [-1, 1, Math.SQRT2], [-1, -1, Math.SQRT2],
];

const blocked = (b) => isSolid(b) || b === BlockTypes.WATER;

/** Can feet stand in voxel (vx, vy, vz)? */
function canStand(world, vx, vy, vz, headroom) {
  if (!isSolid(world.getBlock(c(vx), c(vy - 1), c(vz)))) return false;
  for (let h = 0; h < headroom; h++) {
    if (blocked(world.getBlock(c(vx), c(vy + h), c(vz)))) return false;
  }
  return true;
}

/**
 * Feet level (voxel y) in column (vx, vz) for a walker coming from level
 * `from`: the highest standable level within a step up / drop, or null.
 */
export function standLevel(world, vx, vz, from, { stepUp = NAV_MAX_STEP_UP, drop = NAV_MAX_DROP, headroom = NAV_HEADROOM } = {}) {
  for (let vy = from + stepUp; vy >= from - drop; vy--) {
    if (vy < 1) break;
    if (canStand(world, vx, vy, vz, headroom)) {
      // Stepping up needs headroom over where you are too
      if (vy > from) {
        let clear = true;
        for (let h = headroom; h < headroom + (vy - from); h++) {
          if (blocked(world.getBlock(c(vx), c(from + h), c(vz)))) { clear = false; break; }
        }
        if (!clear) continue;
      }
      return vy;
    }
  }
  return null;
}

/** Feet level for a world position: its own voxel, or the nearest standable one around it. */
export function levelAt(world, x, y, z, opts) {
  const vx = v(x), vz = v(z);
  const vy = v(y + 0.1);
  if (canStand(world, vx, vy, vz, opts?.headroom ?? NAV_HEADROOM)) return vy;
  return standLevel(world, vx, vz, vy, { stepUp: 2, drop: 4, ...opts });
}

/** Binary heap on f-score. */
class Heap {
  constructor() { this.a = []; }
  get size() { return this.a.length; }
  push(n) {
    const a = this.a; a.push(n);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p].f <= a[i].f) break;
      [a[p], a[i]] = [a[i], a[p]]; i = p;
    }
  }
  pop() {
    const a = this.a; const top = a[0]; const last = a.pop();
    if (a.length) {
      a[0] = last; let i = 0;
      for (;;) {
        const l = i * 2 + 1, r = l + 1; let m = i;
        if (l < a.length && a[l].f < a[m].f) m = l;
        if (r < a.length && a[r].f < a[m].f) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i], a[m]]; i = m;
      }
    }
    return top;
  }
}

/**
 * Walk a straight line between two grid points on the ground, as a walker
 * would (same step rules)? Used to straighten paths.
 */
export function canWalkStraight(world, a, b, opts) {
  const [ax, ay, az] = a; const [bx, , bz] = b;
  const dist = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(dist / (VOXEL_SIZE * 0.4));
  let level = v(ay + 0.1);
  let col = `${v(ax)},${v(az)}`;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = ax + (bx - ax) * t;
    const z = az + (bz - az) * t;
    const key = `${v(x)},${v(z)}`;
    if (key === col) continue;
    // Moving diagonally across a corner: both side columns must be walkable too
    const [px, pz] = col.split(',').map(Number);
    if (v(x) !== px && v(z) !== pz) {
      if (standLevel(world, v(x), pz, level, opts) == null || standLevel(world, px, v(z), level, opts) == null) return false;
    }
    const next = standLevel(world, v(x), v(z), level, opts);
    if (next == null) return false;
    level = next;
    col = key;
  }
  return true;
}

/**
 * @param {{ getBlock(x,y,z): number }} world
 * @param {number[]} from - [x, y, z] feet
 * @param {number[]} to - [x, y, z]; needn't be standable (a block to mine): within `goalRadius` cells counts
 * @returns {{ points: number[][], complete: boolean }|null} world points (feet), first is the next one to head for
 */
export function findPath(world, from, to, opts = {}) {
  const { goalRadius = 1, maxNodes = NAV_MAX_NODES, maxRange = NAV_MAX_RANGE } = opts;
  const sx = v(from[0]), sz = v(from[2]);
  const sy = levelAt(world, from[0], from[1], from[2], opts);
  if (sy == null) return null;
  const gx = v(to[0]), gz = v(to[2]);
  const h = (x, z) => Math.hypot(x - gx, z - gz);

  const key = (x, z) => `${x},${z}`;
  const nodes = new Map();
  const open = new Heap();
  const start = { x: sx, z: sz, y: sy, g: 0, f: h(sx, sz), parent: null, closed: false };
  nodes.set(key(sx, sz), start);
  open.push(start);
  let best = start;
  let expanded = 0;
  let goal = null;

  while (open.size && expanded < maxNodes) {
    const n = open.pop();
    if (n.closed) continue;
    n.closed = true;
    expanded++;
    const hn = h(n.x, n.z);
    if (hn < h(best.x, best.z)) best = n;
    if (hn <= goalRadius + 0.01) { goal = n; break; }
    for (const [dx, dz, cost] of DIRS) {
      const nx = n.x + dx, nz = n.z + dz;
      if (Math.abs(nx - sx) > maxRange || Math.abs(nz - sz) > maxRange) continue;
      const ny = standLevel(world, nx, nz, n.y, opts);
      if (ny == null) continue;
      if (dx && dz) {
        // No cutting corners: both side columns walkable from here
        if (standLevel(world, n.x + dx, n.z, n.y, opts) == null) continue;
        if (standLevel(world, n.x, n.z + dz, n.y, opts) == null) continue;
      }
      const g = n.g + cost + (ny > n.y ? 0.5 : 0);
      const k = key(nx, nz);
      const old = nodes.get(k);
      if (old && (old.closed || old.g <= g)) continue;
      const node = { x: nx, z: nz, y: ny, g, f: g + h(nx, nz), parent: n, closed: false };
      nodes.set(k, node);
      open.push(node);
    }
  }

  const end = goal || best;
  if (end === start) return { points: [], complete: !!goal };
  const raw = [];
  for (let n = end; n; n = n.parent) raw.push([c(n.x), n.y * VOXEL_SIZE, c(n.z)]);
  raw.reverse(); // raw[0] is the start column

  // Straighten: from each kept point, jump to the furthest one in a direct line
  const points = [];
  let i = 0;
  while (i < raw.length - 1) {
    let j = raw.length - 1;
    while (j > i + 1 && !canWalkStraight(world, raw[i], raw[j], opts)) j--;
    points.push(raw[j]);
    i = j;
  }
  return { points, complete: !!goal };
}

// ── Per-frame ration of searches ──
let windowStart = 0;
let used = 0;
/** May an agent run a search now? (Shared by every agent.) */
export function takeSearchBudget(now = performance.now()) {
  if (now - windowStart > NAV_SEARCH_WINDOW_MS) { windowStart = now; used = 0; }
  if (used >= NAV_SEARCHES_PER_WINDOW) return false;
  used++;
  return true;
}
/** Tests only. */
export function resetSearchBudget() { windowStart = 0; used = 0; }

/**
 * Follows a path to a goal that may move (a player) and re-plans when the
 * goal moves on, the path runs out, or the walker stops making progress.
 * next() returns the point to steer at, or null when there's nothing to do.
 */
export class PathFollower {
  constructor({ arrive = 0.8, repathMove = 3, stuckSeconds = 1.5, goalRadius = 1, ...searchOpts } = {}) {
    Object.assign(this, { arrive, repathMove, stuckSeconds, goalRadius, searchOpts });
    this.goal = null;
    this.points = null;
    this.planFor = null; // goal the current path was planned for
    this.progressAt = 0;
    this.progressPos = null;
    this.stuck = false;
  }

  /** @param {number[]|null} goal */
  setGoal(goal) {
    this.goal = goal;
    if (!goal) this.points = null;
  }

  /** Force a fresh plan on the next call (e.g. after a failed jump). */
  invalidate() { this.points = null; }

  /**
   * @param {object} world - { getBlock }
   * @param {number[]} pos - walker feet [x, y, z]
   * @param {number} now - seconds
   * @returns {number[]|null} where to head
   */
  next(world, pos, now) {
    const goal = this.goal;
    if (!goal) return null;
    // Progress check: barely moved for a while → re-plan
    if (!this.progressPos || Math.hypot(pos[0] - this.progressPos[0], pos[2] - this.progressPos[2]) > 0.75) {
      this.progressPos = [...pos];
      this.progressAt = now;
      this.stuck = false;
    } else if (now - this.progressAt > this.stuckSeconds) {
      this.stuck = true;
      this.points = null;
      this.progressAt = now;
    }

    const moved = this.planFor && Math.hypot(goal[0] - this.planFor[0], goal[2] - this.planFor[2]) > this.repathMove;
    if (!this.points || moved) {
      // A clear straight walk needs no search
      if (!this.stuck && canWalkStraight(world, pos, goal, this.searchOpts)) {
        this.points = [goal.slice()];
        this.planFor = goal.slice();
      } else if (takeSearchBudget()) {
        const r = findPath(world, pos, goal, { goalRadius: this.goalRadius, ...this.searchOpts });
        this.points = r ? [...r.points] : [];
        if (r?.complete || !r) this.points.push(goal.slice()); // finish on the exact goal
        this.planFor = goal.slice();
      } else {
        return goal; // no search this frame: head straight and ask again
      }
    }
    while (this.points.length > 1 && Math.hypot(this.points[0][0] - pos[0], this.points[0][2] - pos[2]) < this.arrive) {
      this.points.shift();
    }
    return this.points[0] || goal;
  }
}

/**
 * Is there a one-block step just ahead (solid at the feet, room above it)?
 * Physics walkers (monsters, animals) hop it; anything taller they path round.
 * @param {number[]} pos - feet
 * @param {number} dirX
 * @param {number} dirZ - unit direction of travel
 */
export function stepAhead(world, pos, dirX, dirZ, reach = 1.0) {
  const ax = pos[0] + dirX * reach;
  const az = pos[2] + dirZ * reach;
  const vy = v(pos[1] + 0.1);
  if (!isSolid(world.getBlock(ax, c(vy), az))) return false;
  return !blocked(world.getBlock(ax, c(vy + 1), az)) && !blocked(world.getBlock(ax, c(vy + 2), az));
}

/** Horizontal unit vector from `from` toward `to` (or null when on top of it). */
export function headingTo(from, to) {
  const dx = to[0] - from[0];
  const dz = to[2] - from[2];
  const d = Math.hypot(dx, dz);
  return d < 1e-3 ? null : [dx / d, dz / d, d];
}
