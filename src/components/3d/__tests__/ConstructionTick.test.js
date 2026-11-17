import { hasSettlers } from '../ConstructionTick';

describe('ConstructionTick: who builds', () => {
  test('sites build themselves until a settler has joined', () => {
    expect(hasSettlers([])).toBe(false);
    expect(hasSettlers([{ state: 'APPROACHING', arrivedAtSettlement: false }])).toBe(false);
    expect(hasSettlers([{ state: 'EVALUATING', arrivedAtSettlement: true }])).toBe(false);
    expect(hasSettlers([{ state: 'LEAVING', arrivedAtSettlement: true }])).toBe(false);
  });

  test('once someone has settled in, settlers do the building', () => {
    expect(hasSettlers([{ state: 'IDLE', arrivedAtSettlement: true }])).toBe(true);
    expect(hasSettlers([{ state: 'SLEEPING', arrivedAtSettlement: true }])).toBe(true);
  });
});
