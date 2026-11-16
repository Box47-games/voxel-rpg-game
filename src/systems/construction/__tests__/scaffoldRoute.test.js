import {
  getScaffoldRoute,
  projectOnRoute,
  pointOnRoute,
  scaffoldHeightAt,
  nextWaypoint,
  alongAtHeight,
  getActiveScaffoldRoutes,
} from '../scaffoldRoute';
import { getBuildingById } from '../../../data/buildings';
import { VOXEL_SIZE } from '../../chunks/coordinates';

const site = { id: 's1', buildingId: 'wooden_shelter', position: [10, 4, 20], status: 'BUILDING' };
const size = getBuildingById('wooden_shelter').size;

describe('scaffold route', () => {
  const route = getScaffoldRoute(site);

  test('one lap round the outside, from the ground to the second-highest level', () => {
    expect(route.points[0][1]).toBe(4);
    expect(route.top).toBe(4 + (size.height - 1) * VOXEL_SIZE);
    expect(route.points.at(-1)[1]).toBeCloseTo(route.top);
    // Every corner is outside the footprint
    for (const [x, , z] of route.points) {
      const inside = x > 10 && x < 10 + size.width * VOXEL_SIZE && z > 20 && z < 20 + size.depth * VOXEL_SIZE;
      expect(inside).toBe(false);
    }
  });

  test('gentle enough to walk: under 25 degrees', () => {
    for (const s of route.segments) {
      expect(Math.atan2(s.b[1] - s.a[1], s.len) * (180 / Math.PI)).toBeLessThan(25);
    }
  });

  test('height follows the walkway, but only from close to its level', () => {
    const mid = pointOnRoute(route, route.length / 2);
    expect(scaffoldHeightAt([route], mid[0], mid[2], mid[1] - 0.5)).toBeCloseTo(mid[1]);
    // Someone on the ground beneath the high end is not lifted onto it
    const high = pointOnRoute(route, route.length * 0.9);
    expect(scaffoldHeightAt([route], high[0], high[2], 4)).toBeNull();
    // Off the walkway: nothing
    expect(scaffoldHeightAt([route], 0, 0, 4)).toBeNull();
  });

  test('projection and points agree', () => {
    const p = pointOnRoute(route, 7);
    expect(projectOnRoute(route, p[0], p[2]).along).toBeCloseTo(7);
  });

  test('waypoints go corner by corner toward the goal', () => {
    const firstCorner = route.segments[1].start;
    const wp = nextWaypoint(route, 0.5, route.length - 1);
    expect(projectOnRoute(route, wp[0], wp[2]).along).toBeCloseTo(firstCorner);
    const near = nextWaypoint(route, firstCorner + 0.5, firstCorner + 2);
    expect(projectOnRoute(route, near[0], near[2]).along).toBeCloseTo(firstCorner + 2);
  });

  test('alongAtHeight inverts the rise', () => {
    expect(pointOnRoute(route, alongAtHeight(route, 6))[1]).toBeCloseTo(6);
  });

  test('only sites still being built have scaffolding', () => {
    expect(getActiveScaffoldRoutes([site, { ...site, id: 's2', status: 'COMPLETE' }])).toHaveLength(1);
  });
});
