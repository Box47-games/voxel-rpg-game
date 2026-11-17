/**
 * scaffoldRoute.js — The walkable scaffolding ramp around a construction site.
 *
 * The ramp spirals once round the outside of the footprint (front → right →
 * back → left), rising steadily from the ground to the site's second-highest
 * level, so whoever stands at the top can reach the top layer. One lap means
 * every spot on it has a single height. Shared by the visuals, the player's
 * physics colliders, and settlers (SettlerNPC follows its height; builders
 * walk it to reach high blocks).
 */
import { VOXEL_SIZE } from '../chunks/coordinates';
import { SCAFFOLD_OFFSET, SCAFFOLD_WIDTH } from '../../data/tuning';
import { getBuildingById } from '../../data/buildings';

const cache = new Map(); // site id → { key, route }

/**
 * @returns {{ points: number[][], segments: Object[], length: number, width: number, top: number }|null}
 *   points: [x, y, z] corners from the ground start to the top end
 */
export function getScaffoldRoute(site) {
  const building = site && getBuildingById(site.buildingId);
  if (!building || building.size.height < 2) return null;
  const key = `${site.position.join(',')}|${site.buildingId}`;
  const hit = cache.get(site.id);
  if (hit && hit.key === key) return hit.route;

  const [x0, y0, z0] = site.position;
  const w = building.size.width * VOXEL_SIZE;
  const d = building.size.depth * VOXEL_SIZE;
  const o = SCAFFOLD_OFFSET;
  const corners2d = [
    [x0 - o, z0 + d + o],
    [x0 + w + o, z0 + d + o],
    [x0 + w + o, z0 - o],
    [x0 - o, z0 - o],
    [x0 - o, z0 + d + o - SCAFFOLD_WIDTH * 1.5], // stop short of the start: no overlap
  ];
  const lens = [];
  let total = 0;
  for (let i = 1; i < corners2d.length; i++) {
    const l = Math.hypot(corners2d[i][0] - corners2d[i - 1][0], corners2d[i][1] - corners2d[i - 1][1]);
    lens.push(l);
    total += l;
  }
  const rise = (building.size.height - 1) * VOXEL_SIZE;
  let acc = 0;
  const points = corners2d.map(([x, z], i) => {
    if (i > 0) acc += lens[i - 1];
    return [x, y0 + (rise * acc) / total, z];
  });
  const segments = lens.map((len, i) => ({
    a: points[i],
    b: points[i + 1],
    len,
    start: lens.slice(0, i).reduce((s, l) => s + l, 0),
  }));
  const route = { points, segments, length: total, width: SCAFFOLD_WIDTH, top: y0 + rise };
  cache.set(site.id, { key, route });
  return route;
}

/** Closest point on the route to (x, z): distance along it, sideways offset, height. */
export function projectOnRoute(route, x, z) {
  let best = null;
  for (const s of route.segments) {
    const dx = s.b[0] - s.a[0];
    const dz = s.b[2] - s.a[2];
    const t = Math.max(0, Math.min(1, ((x - s.a[0]) * dx + (z - s.a[2]) * dz) / (s.len * s.len)));
    const px = s.a[0] + dx * t;
    const pz = s.a[2] + dz * t;
    const off = Math.hypot(x - px, z - pz);
    if (!best || off < best.off) {
      best = { off, along: s.start + t * s.len, y: s.a[1] + (s.b[1] - s.a[1]) * t };
    }
  }
  return best;
}

/** [x, y, z] at `along` world units from the ground start. */
export function pointOnRoute(route, along) {
  const d = Math.max(0, Math.min(route.length, along));
  for (const s of route.segments) {
    if (d <= s.start + s.len || s === route.segments[route.segments.length - 1]) {
      const t = s.len > 0 ? (d - s.start) / s.len : 0;
      return [0, 1, 2].map((k) => s.a[k] + (s.b[k] - s.a[k]) * Math.min(1, Math.max(0, t)));
    }
  }
  return route.points[0].slice();
}

/**
 * Height of the walkway under (x, z) for someone at height `fromY`, or null
 * if they aren't on it. Only a walkway within `step` of their feet counts, so
 * walking under the high end doesn't lift anyone onto it.
 */
export function scaffoldHeightAt(routes, x, z, fromY, step = VOXEL_SIZE) {
  let best = null;
  for (const route of routes) {
    const p = projectOnRoute(route, x, z);
    if (!p || p.off > route.width / 2) continue;
    if (Math.abs(p.y - fromY) > step) continue;
    if (best === null || Math.abs(p.y - fromY) < Math.abs(best - fromY)) best = p.y;
  }
  return best;
}

/** Routes for every site still under construction. */
export function getActiveScaffoldRoutes(constructionSites) {
  const routes = [];
  for (const site of constructionSites || []) {
    if (site.status === 'COMPLETE') continue;
    const r = getScaffoldRoute(site);
    if (r) routes.push(r);
  }
  return routes;
}

const PLANK = 0.2; // walkway thickness

/**
 * Box transform for one ramp segment, top surface on the route:
 * { position, rotation (Euler [x, y, z], order 'YZX'), size [length, thickness, width] }
 */
export function segmentBox(route, s) {
  const dx = s.b[0] - s.a[0];
  const dz = s.b[2] - s.a[2];
  const rise = s.b[1] - s.a[1];
  const yaw = Math.atan2(-dz, dx);
  const pitch = Math.atan2(rise, s.len);
  return {
    position: [(s.a[0] + s.b[0]) / 2, (s.a[1] + s.b[1]) / 2 - PLANK / 2, (s.a[2] + s.b[2]) / 2],
    rotation: [0, yaw, pitch],
    size: [Math.hypot(s.len, rise) + route.width * 0.5, PLANK, route.width],
  };
}

/**
 * Where someone `here` world units along the route should head next to reach
 * `goal` along it: the next corner in that direction, or the goal itself.
 * Walking corner to corner keeps them on the walkway.
 */
export function nextWaypoint(route, here, goal) {
  const dir = Math.sign(goal - here);
  const corners = route.segments.map((s) => s.start).concat(route.length);
  const between = corners.filter((c) => (dir > 0 ? c > here + 0.3 && c < goal : c < here - 0.3 && c > goal));
  const target = between.length ? (dir > 0 ? Math.min(...between) : Math.max(...between)) : goal;
  return pointOnRoute(route, target);
}

/** Distance along the route where the walkway is at height `y` (clamped). */
export function alongAtHeight(route, y) {
  const y0 = route.points[0][1];
  const rise = route.top - y0;
  if (rise <= 0) return 0;
  return route.length * Math.max(0, Math.min(1, (y - y0) / rise));
}

const ringCache = new Map(); // site id → { key, ring }

/**
 * The closed walking loop at ground level round a site's footprint, on the
 * same line as the ramp (SCAFFOLD_OFFSET outside the walls) and with the same
 * `along` origin and direction, so ramp and ring positions line up. Builders
 * walk it to reach their spot without climbing over the walls they're building.
 * @returns {{ points: number[][], segments: Object[], length: number, y: number }|null}
 */
export function getGroundRing(site) {
  const building = site && getBuildingById(site.buildingId);
  if (!building) return null;
  const key = `${site.position.join(',')}|${site.buildingId}`;
  const hit = ringCache.get(site.id);
  if (hit && hit.key === key) return hit.ring;

  const [x0, y0, z0] = site.position;
  const w = building.size.width * VOXEL_SIZE;
  const d = building.size.depth * VOXEL_SIZE;
  const o = SCAFFOLD_OFFSET;
  const points = [
    [x0 - o, y0, z0 + d + o],
    [x0 + w + o, y0, z0 + d + o],
    [x0 + w + o, y0, z0 - o],
    [x0 - o, y0, z0 - o],
    [x0 - o, y0, z0 + d + o],
  ];
  let start = 0;
  const segments = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const len = Math.hypot(b[0] - a[0], b[2] - a[2]);
    segments.push({ a, b, len, start });
    start += len;
  }
  const ring = { points, segments, length: start, y: y0 };
  ringCache.set(site.id, { key, ring });
  return ring;
}

/** `along` wrapped into [0, ring.length). */
const wrapAlong = (ring, along) => ((along % ring.length) + ring.length) % ring.length;

/** [x, y, z] on the ring at `along` (wraps round). */
export function pointOnRing(ring, along) {
  return pointOnRoute(ring, wrapAlong(ring, along));
}

/** Shortest distance round the ring between two `along` values. */
export function ringGap(ring, a, b) {
  const d = Math.abs(wrapAlong(ring, a) - wrapAlong(ring, b));
  return Math.min(d, ring.length - d);
}

/**
 * Next point to head for on the ring, going the short way round from `here`
 * to `goal`: the next corner on the way, or the goal itself.
 */
export function ringWaypoint(ring, here, goal) {
  const P = ring.length;
  const fwd = wrapAlong(ring, goal - here); // distance going forwards
  const dir = fwd <= P / 2 ? 1 : -1;
  const dist = dir > 0 ? fwd : P - fwd;
  let best = dist;
  for (const s of ring.segments) {
    const off = wrapAlong(ring, dir > 0 ? s.start - here : here - s.start);
    if (off > 0.3 && off < best) best = off;
  }
  return pointOnRing(ring, here + dir * best);
}
