import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import useGameStore from '../../../stores/useGameStore';
import NPCPanel, { describeActivity, describeMood } from '../NPCPanel';
import {
  NPC_LEAVE_WARNING_DAYS,
  NPC_LEAVE_DEPARTURE_DAYS,
  NPC_LEAVE_HAPPINESS_THRESHOLD,
} from '../../../data/tuning';

const settler = (overrides = {}) => ({
  id: 'npc_1',
  fullName: 'Mira Thorne',
  personality: 'curious',
  preferredJob: 'miner',
  position: [0, 2, 0],
  state: 'WORKING_MINE',
  hunger: 72.4,
  rest: 10,
  social: 55,
  happiness: 60,
  unhappyDays: 0,
  skills: { gathering: 0.5, mining: 0.91, building: 0.3, combat: 0.42 },
  appearance: {},
  ...overrides,
});

function setNPCs(npcs, activeNPCId = 'npc_1') {
  const s = useGameStore.getState();
  useGameStore.setState({ settlement: { ...s.settlement, npcs }, activeNPCId });
}

describe('NPCPanel', () => {
  beforeEach(() => {
    useGameStore.getState().reset();
  });

  test('renders nothing when no settler is selected', () => {
    const { container } = render(<NPCPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  test('shows identity, activity, needs and skills', () => {
    setNPCs([settler({ state: 'SLEEPING' })]);
    render(<NPCPanel />);
    expect(screen.getByText('Mira Thorne')).toBeInTheDocument();
    expect(screen.getByText('Curious · prefers miner work')).toBeInTheDocument();
    expect(screen.getByText('Sleeping')).toBeInTheDocument();
    expect(screen.getByRole('meter', { name: 'Food' })).toHaveAttribute('aria-valuenow', '72');
    expect(screen.getByRole('meter', { name: 'Rest' })).toHaveAttribute('aria-valuenow', '10');
    expect(screen.getByRole('meter', { name: 'Mining' })).toHaveAttribute('aria-valuenow', '91');
  });

  test('updates when the settler changes', () => {
    setNPCs([settler()]);
    render(<NPCPanel />);
    act(() => setNPCs([settler({ state: 'WORKING_HAUL', carryingItem: { material: 'iron_ore', amount: 3 } })]));
    expect(screen.getByText('Hauling 3 iron ore')).toBeInTheDocument();
  });

  test('does not re-render when only position or sub-integer needs change', () => {
    setNPCs([settler()]);
    let commits = 0;
    render(
      <React.Profiler id="npc-panel" onRender={() => { commits++; }}>
        <NPCPanel />
      </React.Profiler>
    );
    const afterMount = commits;
    act(() => setNPCs([settler({ position: [5, 2, 5], hunger: 72.1 })]));
    expect(commits).toBe(afterMount);

    act(() => setNPCs([settler({ hunger: 60 })]));
    expect(commits).toBe(afterMount + 1);
  });

  test('closes with the X button and with Escape', () => {
    setNPCs([settler()]);
    render(<NPCPanel />);
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(useGameStore.getState().activeNPCId).toBeNull();

    act(() => setNPCs([settler()]));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useGameStore.getState().activeNPCId).toBeNull();
  });

  test('closes itself when the settler is gone', () => {
    setNPCs([settler()]);
    render(<NPCPanel />);
    act(() => setNPCs([], 'npc_1'));
    expect(useGameStore.getState().activeNPCId).toBeNull();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('describeActivity', () => {
  test('labels known states and falls back for unknown ones', () => {
    expect(describeActivity('SLEEPING')).toBe('Sleeping');
    expect(describeActivity('WORKING_HAUL', null)).toBe('Fetching materials');
    expect(describeActivity('SOME_NEW_STATE')).toBe('some new state');
    expect(describeActivity(undefined)).toBe('Unknown');
  });
});

describe('describeMood', () => {
  test('is quiet for content settlers', () => {
    expect(describeMood(80, 0)).toBeNull();
  });

  test('flags unhappiness and the departure countdown', () => {
    expect(describeMood(NPC_LEAVE_HAPPINESS_THRESHOLD - 1, 0)).toBe('Unhappy');
    const daysLeft = NPC_LEAVE_DEPARTURE_DAYS - NPC_LEAVE_WARNING_DAYS;
    expect(describeMood(10, NPC_LEAVE_WARNING_DAYS)).toMatch(`may leave in ${daysLeft} day`);
    expect(describeMood(10, NPC_LEAVE_DEPARTURE_DAYS)).toBe('Unhappy — about to leave');
  });
});
