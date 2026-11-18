import { findInteractTarget, distanceToZone } from '../interactTarget';

const stockpile = { id: 'sp', type: 'STOCKPILE', bounds: { minX: 0, minZ: 0, maxX: 20, maxZ: 20 }, storage: { items: {} } };
const store = (over = {}) => ({ zones: [stockpile], constructionSites: [], settlement: { npcs: [] }, ...over });

describe('what E opens', () => {
  test('a stockpile from anywhere inside it, or just outside its edge', () => {
    expect(findInteractTarget(store(), [18, 0, 3])).toMatchObject({ kind: 'stockpile', id: 'sp' }); // far corner, inside
    expect(findInteractTarget(store(), [22, 0, 10])).toMatchObject({ kind: 'stockpile' }); // 2 outside
    expect(findInteractTarget(store(), [30, 0, 10])).toBeNull();
  });

  test('a settler standing closer than the stockpile edge wins', () => {
    const npc = { id: 'n1', firstName: 'Ada', position: [23, 0, 10], state: 'IDLE' };
    expect(findInteractTarget(store({ settlement: { npcs: [npc] } }), [23, 0, 10])).toMatchObject({ kind: 'settler', label: 'Ada' });
  });

  test('distanceToZone is 0 inside and the gap outside', () => {
    expect(distanceToZone(stockpile, 5, 5)).toBe(0);
    expect(distanceToZone(stockpile, 23, 24)).toBe(5);
  });
});
