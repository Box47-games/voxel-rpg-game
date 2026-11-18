/**
 * One mode and one panel at a time; Esc backs out one step.
 */
import useGameStore from '../useGameStore';

const s = () => useGameStore.getState();
const reset = () => useGameStore.setState({
  planMode: false, zoneMode: false, placingBuildingId: null,
  openPanel: null, settlementDashboardOpen: false, activeBuildingCatalog: false,
  activeNPCId: null, activeConstructionSiteId: null, activeStockpileZoneId: null,
});

describe('modes and panels', () => {
  beforeEach(reset);

  test('plan mode toggles; there is no build mode any more', () => {
    s().enterMode('plan');
    expect([s().planMode, s().zoneMode]).toEqual([true, true]);
    expect(s().zoneTypeToPlace).toBe('MINING');
    s().enterMode('plan');
    expect([s().planMode, s().zoneMode]).toEqual([false, false]);
    expect('buildMode' in s()).toBe(false);
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

  test('entering a mode closes panels; opening a panel cancels placement', () => {
    s().togglePanel('inventory');
    s().enterMode('plan');
    expect(s().openPanel).toBeNull();
    expect([s().planMode, s().zoneMode]).toEqual([true, true]);
    s().togglePanel('crafting'); // panels open over plan mode
    expect([s().planMode, s().zoneMode, s().openPanel]).toEqual([true, true, 'crafting']);
    s().enterMode('play');
    s().startPlacingBuilding('wooden_shelter');
    expect([s().planMode, s().zoneMode, s().openPanel]).toEqual([false, false, null]);
    s().togglePanel('inventory');
    expect(s().placingBuildingId).toBeNull();
  });

  test('Esc backs out one step at a time, then reports nothing left (pause)', () => {
    s().enterMode('plan');
    s().togglePanel('inventory'); // a panel over plan mode keeps the mode
    expect(s().backOut()).toBe(true); // closes the inventory
    expect(s().openPanel).toBeNull();
    expect(s().planMode).toBe(true);
    expect(s().backOut()).toBe(true); // leaves plan mode
    expect(s().planMode).toBe(false);
    expect(s().backOut()).toBe(false); // nothing left: the caller pauses

    s().startPlacingBuilding('wooden_shelter');
    expect(s().backOut()).toBe(true);
    expect(s().placingBuildingId).toBeNull();

    useGameStore.setState({ activeNPCId: 'npc_1' });
    expect(s().backOut()).toBe(true);
    expect(s().activeNPCId).toBeNull();
  });

  test('plan mode: P toggles; placing a building and backing out returns to the zone tool', () => {
    s().enterMode('plan');
    expect([s().planMode, s().zoneMode, s().zoneTypeToPlace]).toEqual([true, true, 'MINING']);
    s().setZoneMode(true, 'FARMING');
    s().startPlacingBuilding('farm_plot');
    expect([s().planMode, s().zoneMode, s().placingBuildingId]).toEqual([true, false, 'farm_plot']);
    s().placeConstructionSite('farm_plot', [0, 0, 0], {}, 3);
    expect([s().planMode, s().zoneMode, s().zoneTypeToPlace, s().placingBuildingId]).toEqual([true, true, 'FARMING', null]);
    s().startPlacingBuilding('farm_plot');
    expect(s().backOut()).toBe(true); // cancels the placement, still planning
    expect([s().planMode, s().zoneMode]).toEqual([true, true]);
    expect(s().backOut()).toBe(true); // leaves plan mode
    expect([s().planMode, s().zoneMode]).toEqual([false, false]);
    s().enterMode('plan');
    s().enterMode('plan'); // same key again: back to play
    expect(s().planMode).toBe(false);
  });

  test('placing a building outside plan mode does not start zoning afterwards', () => {
    s().startPlacingBuilding('farm_plot');
    s().cancelPlacingBuilding();
    expect([s().planMode, s().zoneMode]).toEqual([false, false]);
  });

  test('entering plan mode leaves first person', () => {
    s().updateCamera({ firstPerson: true });
    s().enterMode('plan');
    expect(s().camera.firstPerson).toBe(false);
  });
});

describe('help screen', () => {
  beforeEach(reset);

  test('Esc closes help before anything else, and does not pause', () => {
    useGameStore.setState({ helpOpen: true, planMode: true });
    expect(s().backOut()).toBe(true);
    expect(s().helpOpen).toBe(false);
    expect(s().planMode).toBe(true); // one step at a time
  });

  test('opening a panel closes help', () => {
    s().setHelpOpen(true);
    s().togglePanel('inventory');
    expect(s().helpOpen).toBe(false);
  });
});
