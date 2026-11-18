import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import BuildingPanel from '../BuildingPanel';
import { clearTasks, scanForTasks, findBestTask, claimTask } from '../../../systems/settlement/TaskAssignmentEngine';

// Completed sites keep the material fields they were placed with
const DONE = { materialsRequired: { wood: 1 }, materialsDelivered: { wood: 1 }, blocksPlaced: 1, totalBlocks: 1 };
const npc = (id, fullName, extra = {}) => ({ id, fullName, state: 'IDLE', position: [0, 2, 0], skills: { building: 0.5 }, ...extra });

function open(sites, extra = {}) {
  const s = useGameStore.getState();
  useGameStore.setState({
    constructionSites: sites,
    activeConstructionSiteId: sites[0].id,
    settlement: { ...s.settlement, npcs: [] },
    ...extra,
  });
  return render(<BuildingPanel />);
}

describe('BuildingPanel', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
    clearTasks();
  });

  test('a completed house lists its residents; clicking one opens their panel', () => {
    const s = useGameStore.getState();
    open([{ id: 'h1', buildingId: 'stone_house', status: 'COMPLETE', position: [0, 0, 0], ...DONE }], {
      settlement: { ...s.settlement, npcs: [npc('a', 'Aldric', { homeId: 'h1' }), npc('b', 'Bria')] },
    });
    expect(screen.getByRole('dialog', { name: 'Stone House' })).toBeInTheDocument();
    expect(screen.getByText(/Beds: 1 \/ 2/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Aldric' }));
    expect(useGameStore.getState().activeNPCId).toBe('a');
    expect(useGameStore.getState().activeConstructionSiteId).toBeNull();
  });

  test('a Farm Plot says whether it powers a farm', () => {
    open([{ id: 'p', buildingId: 'farm_plot', status: 'COMPLETE', position: [0, 2, 0], ...DONE }], {
      zones: [{ id: 'f', type: 'FARMING', bounds: { minX: 8, minZ: 0, maxX: 12, maxZ: 4 }, farmTiles: [] }],
    });
    expect(screen.getByText('Powers 1 farm')).toBeInTheDocument();
  });

  test('demolishing needs confirmation', () => {
    open([{ id: 'h1', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [0, 0, 0], ...DONE }]);
    fireEvent.click(screen.getByRole('button', { name: 'Demolish' }));
    expect(screen.getByText(/You get back 12 wood/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Keep it' }));
    expect(useGameStore.getState().constructionSites).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Demolish' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Demolish' })[0]);
    expect(useGameStore.getState().constructionSites).toHaveLength(0);
  });

  test('a site under construction can be opened and shows its builder and ETA', () => {
    const site = { id: 'c1', buildingId: 'wooden_shelter', status: 'BUILDING', position: [0, 0, 0], blocksPlaced: 20, totalBlocks: 24, materialsRequired: { wood: 25 }, materialsDelivered: { wood: 25 } };
    scanForTasks([], [site], null);
    const task = findBestTask(npc('x', 'X'));
    claimTask(task.id, 'b');
    const s = useGameStore.getState();
    open([site], { settlement: { ...s.settlement, npcs: [npc('b', 'Bria', { state: 'WORKING_BUILD', currentTaskId: task.id })] } });
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // not auto-closed
    expect(screen.getByText(/20\/24 placed\), ~24s left/)).toBeInTheDocument();
    expect(screen.getByText('Builder: Bria')).toBeInTheDocument();
  });

  test('a Shelter offers its upgrade, blocked until the Stone House milestone', () => {
    open([{ id: 'h1', buildingId: 'wooden_shelter', status: 'COMPLETE', position: [0, 0, 0], ...DONE }]);
    expect(screen.getByText('Upgrade to Stone House')).toBeInTheDocument();
    expect(screen.getByText(/Beds 1 → 2/)).toBeInTheDocument();
    expect(screen.getByText(/Costs 40 wood, 30 stone; needs 3 settlers/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Upgrade' })).toBeDisabled();
    expect(screen.getByText(/Needs 3 settlers/)).toBeInTheDocument();

    const s = useGameStore.getState();
    act(() => useGameStore.setState({ settlement: { ...s.settlement, npcs: [npc('a', 'Aldric'), npc('b', 'Bria'), npc('c', 'Cole')] } }));
    fireEvent.click(screen.getByRole('button', { name: 'Upgrade' }));
    const [site] = useGameStore.getState().constructionSites;
    expect(site).toMatchObject({ buildingId: 'stone_house', upgradeFrom: 'wooden_shelter', status: 'PLACED' });
    expect(screen.getByText(/upgrading the Wooden Shelter/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Cancel upgrade' })).toBeInTheDocument();
  });

  test('an upgrade that is already building cannot be cancelled', () => {
    open([{ id: 'h1', buildingId: 'stone_house', upgradeFrom: 'wooden_shelter', status: 'BUILDING', position: [0, 0, 0], materialsRequired: { wood: 40 }, materialsDelivered: { wood: 40 }, blocksPlaced: 2, totalBlocks: 40 }]);
    expect(screen.queryByRole('button', { name: /Cancel/ })).toBeNull();
  });

  test('part built and short: shows what is up, what the next piece needs, and still takes deliveries', () => {
    const site = { id: 'c1', buildingId: 'wooden_shelter', status: 'BUILDING', position: [0, 0, 0], blocksPlaced: 5, totalBlocks: 22, materialsRequired: { wood: 25 }, materialsDelivered: { wood: 5 } };
    open([site]);
    expect(screen.getByText('WAITING')).toBeInTheDocument();
    expect(screen.getByText('Built: 5/22')).toBeInTheDocument();
    expect(screen.getByText(/Paused: the next piece needs .* wood more/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deliver All' })).toBeInTheDocument();
  });
});
