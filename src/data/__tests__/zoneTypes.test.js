import { createZone, getStockpileCapacity } from '../zoneTypes';
import { STOCKPILE_CAPACITY_PER_VOXEL } from '../tuning';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';

describe('zone creation', () => {
  test('stockpiles get capacity from their ground area', () => {
    // 4 x 3 voxels
    const bounds = { minX: 0, minZ: 0, maxX: 4 * VOXEL_SIZE, maxZ: 3 * VOXEL_SIZE };
    const zone = createZone({ type: 'STOCKPILE', ...bounds });
    expect(zone.storage.capacity).toBe(12 * STOCKPILE_CAPACITY_PER_VOXEL);
    expect(zone.storage.capacity).toBe(getStockpileCapacity(bounds));
    expect(zone.storage.usedCapacity).toBe(0);
  });

  test('other zone types have no storage', () => {
    expect(createZone({ type: 'MINING', minX: 0, minZ: 0, maxX: 8, maxZ: 8 }).storage).toBeNull();
  });
});
