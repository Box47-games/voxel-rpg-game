/**
 * The settlers' daily routine: schedule blocks, and how the state machine follows them.
 */
import { getScheduleBlock, getTimeOfDay, Activity } from '../schedule';
import { tickNPC } from '../NPCStateMachine';
import { scanForTasks, clearTasks, getTask } from '../../../systems/settlement/TaskAssignmentEngine';
import { scanMiningZone } from '../../../systems/settlement/MiningZoneScanner';
import { BlockTypes } from '../../../systems/chunks/blockTypes';
import {
  SUNRISE_START,
  SUNRISE_END,
  SUNSET_START,
  SUNSET_END,
  SCHEDULE_LUNCH_START,
  SCHEDULE_LUNCH_END,
  SCHEDULE_PERSONALITY_SHIFT,
  DAY_LENGTH_SECONDS,
  NPC_HUNGER_DECAY_RATE,
  NPC_SLEEP_HUNGER_DECAY_MULT,
  NPC_MEAL_HUNGER,
} from '../../../data/tuning';
import { makeFakeChunkManager, makeFakeHost, makeNPC, makeContext } from './helpers/fakeWorld';

const NIGHT = 0.9;
const DAWN = (SUNRISE_START + SUNRISE_END) / 2;
const MORNING = 0.4;
const LUNCH = (SCHEDULE_LUNCH_START + SCHEDULE_LUNCH_END) / 2;
const EVENING = (SUNSET_START + SUNSET_END) / 2;

describe('getScheduleBlock', () => {
  test('follows the day: sleep, breakfast, work, lunch, work, evening', () => {
    const at = (t) => getScheduleBlock(t).activity;
    expect(at(0)).toBe(Activity.SLEEP);
    expect(at(SUNRISE_START - 0.001)).toBe(Activity.SLEEP);
    expect(at(DAWN)).toBe(Activity.MEAL);
    expect(at(MORNING)).toBe(Activity.WORK);
    expect(at(LUNCH)).toBe(Activity.MEAL);
    expect(at(0.6)).toBe(Activity.WORK);
    expect(at(EVENING)).toBe(Activity.LEISURE);
    expect(at(SUNSET_END)).toBe(Activity.SLEEP);
    expect(at(1.4)).toBe(Activity.WORK); // wraps
  });

  test('diligent settlers work longer, lazy ones shorter', () => {
    const early = SUNRISE_END - SCHEDULE_PERSONALITY_SHIFT / 2;
    const late = SUNSET_START + SCHEDULE_PERSONALITY_SHIFT / 2;
    expect(getScheduleBlock(early, 'diligent').activity).toBe(Activity.WORK);
    expect(getScheduleBlock(early, 'stoic').activity).toBe(Activity.MEAL);
    expect(getScheduleBlock(late, 'diligent').activity).toBe(Activity.WORK);
    expect(getScheduleBlock(late, 'stoic').activity).toBe(Activity.LEISURE);

    const lazyStart = SUNRISE_END + SCHEDULE_PERSONALITY_SHIFT / 2;
    expect(getScheduleBlock(lazyStart, 'lazy').activity).toBe(Activity.MEAL);
    expect(getScheduleBlock(lazyStart, 'stoic').activity).toBe(Activity.WORK);
  });

  test('labels describe the block', () => {
    expect(getScheduleBlock(MORNING).label).toBe('Morning shift');
    expect(getScheduleBlock(NIGHT).label).toBe('Night');
  });
});

describe('getTimeOfDay', () => {
  test('uses the store value, or derives it from elapsed time', () => {
    expect(getTimeOfDay({ timeOfDay: 0.3, elapsed: 0 })).toBe(0.3);
    expect(getTimeOfDay({ elapsed: DAY_LENGTH_SECONDS * 2.25 })).toBeCloseTo(0.25);
    expect(getTimeOfDay(undefined)).toBe(0);
  });
});

// ── Following the schedule ─────────────────────────────────────

const MINE_POS = [101, 5, 101];

function setup({ timeOfDay, materials = {} }) {
  const chunkManager = makeFakeChunkManager();
  chunkManager.place(...MINE_POS, BlockTypes.STONE);
  const bounds = { minX: 100, minZ: 100, maxX: 102, maxZ: 102 };
  const zone = { id: 'mine_1', type: 'MINING', bounds, storage: null, miningTasks: scanMiningZone(bounds, chunkManager) };
  const host = makeFakeHost({ zones: [zone], materials });
  const ctx = makeContext({ host, chunkManager, inventory: { materials }, timeOfDay });
  scanForTasks([zone], [], chunkManager);
  return ctx;
}

const tick = (npc, ctx, delta = 2) => ({ ...npc, ...tickNPC(npc, delta, ctx).updates });

beforeEach(() => clearTasks());

describe('night', () => {
  test('a rested idle settler goes to bed at night', () => {
    const next = tick(makeNPC({ rest: 90 }), setup({ timeOfDay: NIGHT }));
    expect(next.state).toBe('SLEEPING');
    expect(next.targetPosition).not.toBeNull();
  });

  test('a worker parks its task at nightfall and picks it up again at dawn', () => {
    const ctx = setup({ timeOfDay: MORNING });
    const working = tick(makeNPC(), ctx);
    expect(working.state).toBe('WORKING_MINE');
    const taskId = working.currentTaskId;

    const asleep = tick(working, { ...ctx, timeOfDay: NIGHT });
    expect(asleep.state).toBe('SLEEPING');
    expect(asleep.savedTaskId).toBe(taskId);
    expect(getTask(taskId).claimedBy).toBeNull();

    // Fully rested, but it's still night: stays in bed
    const stillAsleep = tick({ ...asleep, rest: 100 }, { ...ctx, timeOfDay: NIGHT });
    expect(stillAsleep.state).toBe('SLEEPING');

    const awake = tick(stillAsleep, { ...ctx, timeOfDay: MORNING });
    expect(awake.state).toBe('WORKING_MINE');
    expect(awake.currentTaskId).toBe(taskId);
  });

  test('sleepers get hungry more slowly and do not get lonely', () => {
    const next = tick(makeNPC({ state: 'SLEEPING', hunger: 80, social: 50 }), setup({ timeOfDay: NIGHT }), 10);
    expect(next.hunger).toBeCloseTo(80 - NPC_HUNGER_DECAY_RATE * NPC_SLEEP_HUNGER_DECAY_MULT * 10);
    expect(next.social).toBe(50);
  });

  test('a starving sleeper gets up to eat, then goes back to bed without working', () => {
    const ctx = setup({ timeOfDay: NIGHT, materials: { berry: 3 } });
    const eating = tick(makeNPC({ state: 'SLEEPING', hunger: 5, savedTaskId: 'parked' }), ctx);
    expect(eating.state).toBe('EATING');

    const done = tick({ ...eating, stateTimer: 99 }, ctx);
    expect(done.state).toBe('IDLE');
    expect(done.savedTaskId).toBe('parked'); // not resumed at night

    // Fed enough (one berry wouldn't be): back to bed
    expect(tick({ ...done, hunger: 50 }, ctx).state).toBe('SLEEPING');
  });
});

describe('daytime', () => {
  test('settlers take work on shift but not during breaks', () => {
    expect(tick(makeNPC(), setup({ timeOfDay: MORNING })).state).toBe('WORKING_MINE');
    clearTasks();
    expect(tick(makeNPC(), setup({ timeOfDay: LUNCH })).state).not.toBe('WORKING_MINE');
  });

  test('a peckish settler eats once per mealtime', () => {
    const ctx = setup({ timeOfDay: LUNCH, materials: { berry: 5 } });
    const npc = makeNPC({ hunger: NPC_MEAL_HUNGER - 10 });
    const eating = tick(npc, ctx);
    expect(eating.state).toBe('EATING');

    const after = tick({ ...eating, state: 'IDLE', stateTimer: 0 }, ctx);
    expect(after.state).not.toBe('EATING'); // already had lunch

    expect(tick({ ...makeNPC({ hunger: NPC_MEAL_HUNGER + 5 }) }, ctx).state).not.toBe('EATING');
  });

  test('settlers are sociable in the evening', () => {
    const other = makeNPC({ id: 'npc_2', position: [55, 2, 50] });
    const npc = makeNPC({ social: 60 });
    const evening = tick(npc, { ...setup({ timeOfDay: EVENING }), npcs: [npc, other] });
    expect(evening.state).toBe('SOCIALIZING');

    clearTasks();
    const morning = tick(npc, { ...setup({ timeOfDay: MORNING }), npcs: [npc, other] });
    expect(morning.state).toBe('WORKING_MINE');
  });

  test('an exhausted settler still naps during the day and wakes once rested', () => {
    const ctx = setup({ timeOfDay: MORNING });
    const napping = tick(makeNPC({ rest: 5 }), ctx);
    expect(napping.state).toBe('SLEEPING');
    expect(tick({ ...napping, rest: 95 }, ctx).state).not.toBe('SLEEPING');
  });
});
