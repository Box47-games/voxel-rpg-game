/**
 * One mode and one panel at a time; Esc backs out one step.
 */
import useGameStore from '../useGameStore';

const s = () => useGameStore.getState();
const reset = () => useGameStore.setState({
  buildMode: false, zoneMode: false, placingBuildingId: null,
  openPanel: null, settlementDashboardOpen: false, activeBuildingCatalog: false,
  activeNPCId: null, activeConstructionSiteId: null, activeStockpileZoneId: null,
});

describe('modes and panels', () => {
  beforeEach(reset);

  test('entering a mode leaves the other; entering it again returns to play', () => {
    s().enterMode('build');
    expect([s().buildMode, s().zoneMode]).toEqual([true, false]);
    s().enterMode('zone');
    expect([s().buildMode, s().zoneMode]).toEqual([false, true]);
    expect(s().zoneTypeToPlace).toBe('MINING');
    s().enterMode('zone');
    expect([s().buildMode, s().zoneMode]).toEqual([false, false]);
  });

  test('one panel at a time', () => {
    s().togglePanel('inventory');
    expect(s().openPanel).toBe('inventory');
    s().togglePanel('settlement');
    expect(s().openPanel).toBeNull();
    expect(s().settlementDashboardOpen).toBe(true);
    s().toggleBuildingCatalog();
    expect(s().settlementDashboardOpen).toBe(false);
    expect(s().activeBuildingCatalog).toBe(true);
    s().togglePanel('crafting');
    expect(s().activeBuildingCatalog).toBe(false);
    expect(s().openPanel).toBe('crafting');
    s().togglePanel('crafting');
    expect(s().openPanel).toBeNull();
  });

  test('entering a mode closes panels; opening a panel cancels zoning and placement', () => {
    s().togglePanel('inventory');
    s().enterMode('build');
    expect(s().openPanel).toBeNull();
    s().enterMode('zone');
    s().togglePanel('crafting');
    expect(s().zoneMode).toBe(false);
    s().startPlacingBuilding('wooden_shelter');
    expect([s().buildMode, s().zoneMode, s().openPanel]).toEqual([false, false, null]);
    s().togglePanel('inventory');
    expect(s().placingBuildingId).toBeNull();
  });

  test('Esc backs out one step at a time, then reports nothing left (pause)', () => {
    s().enterMode('build');
    s().togglePanel('inventory'); // a panel over build mode keeps the mode
    expect(s().backOut()).toBe(true); // closes the inventory
    expect(s().openPanel).toBeNull();
    expect(s().buildMode).toBe(true);
    expect(s().backOut()).toBe(true); // leaves build mode
    expect(s().buildMode).toBe(false);
    expect(s().backOut()).toBe(false); // nothing left: the caller pauses

    s().startPlacingBuilding('wooden_shelter');
    expect(s().backOut()).toBe(true);
    expect(s().placingBuildingId).toBeNull();

    useGameStore.setState({ activeNPCId: 'npc_1' });
    expect(s().backOut()).toBe(true);
    expect(s().activeNPCId).toBeNull();
  });
});
