/**
 * NPCStateMachine.test.js — Tests for the NPC needs + state machine
 * (the live settlement NPC logic; the work loop is in NPCWorkBehavior.test.js).
 */

import {
  tickNPC,
  getIdleTimerRange,
  getWanderRadiusMult,
  getSocialDecayMult,
  getPersonalityHappinessBonus,
} from '../NPCStateMachine';
import { clearTasks } from '../../../systems/settlement/TaskAssignmentEngine';
import {
  NPC_THOUGHT_DURATION,
  NPC_HUNGER_DECAY_RATE,
  NPC_REST_DECAY_RATE,
  NPC_EATING_DURATION,
  NPC_FOOD_SOURCES,
  NPC_SLEEP_HUNGER_DECAY_MULT,
  NPC_REST_CRITICAL,
  DAY_LENGTH_SECONDS,
} from '../../../data/tuning';
import { makeNPC, makeContext, makeStockpile } from './helpers/fakeWorld';

beforeEach(() => {
  clearTasks();
});

// ── Personality helpers ───────────────────────────────────────

describe('Personality helpers', () => {
  test('getIdleTimerRange returns correct ranges', () => {
    expect(getIdleTimerRange('diligent')).toEqual([3, 8]);
    expect(getIdleTimerRange('lazy')).toEqual([10, 20]);
    expect(getIdleTimerRange('curious')).toEqual([3, 8]);
    expect(getIdleTimerRange('stoic')).toEqual([5, 15]);
    expect(getIdleTimerRange('unknown')).toEqual([5, 15]);
  });

  test('getWanderRadiusMult returns correct multipliers', () => {
    expect(getWanderRadiusMult('brave')).toBe(2.0);
    expect(getWanderRadiusMult('cautious')).toBe(0.5);
    expect(getWanderRadiusMult('stoic')).toBe(1.0);
  });

  test('getSocialDecayMult returns 0.5 for stoic, 1.0 otherwise', () => {
    expect(getSocialDecayMult('stoic')).toBe(0.5);
    expect(getSocialDecayMult('cheerful')).toBe(1.0);
  });

  test('getPersonalityHappinessBonus returns correct bonuses', () => {
    expect(getPersonalityHappinessBonus('cheerful')).toBe(10);
    expect(getPersonalityHappinessBonus('grumpy')).toBe(-10);
    expect(getPersonalityHappinessBonus('stoic')).toBe(0);
  });
});

// ── Needs decay ──────────────────────────────────────────────

describe('Needs decay', () => {
  test('hunger decays at NPC_HUNGER_DECAY_RATE per second', () => {
    const npc = makeNPC({ hunger: 80 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.hunger).toBeCloseTo(80 - NPC_HUNGER_DECAY_RATE * 2, 5);
  });

  test('rest decays at NPC_REST_DECAY_RATE per second', () => {
    const npc = makeNPC({ rest: 80 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.rest).toBeCloseTo(80 - NPC_REST_DECAY_RATE * 2, 5);
  });

  test('balance: about three meals a day, and no daytime naps', () => {
    // Night is 40% of the day (dusk to dawn), with hunger decaying slower asleep
    const awake = DAY_LENGTH_SECONDS * 0.6;
    const asleep = DAY_LENGTH_SECONDS * 0.4;
    const hungerPerDay = NPC_HUNGER_DECAY_RATE * (awake + asleep * NPC_SLEEP_HUNGER_DECAY_MULT);
    const restores = NPC_FOOD_SOURCES.map((f) => f.restore);
    const meals = (r) => hungerPerDay / r;
    expect(meals(Math.max(...restores))).toBeGreaterThanOrEqual(2);
    expect(meals(Math.min(...restores))).toBeLessThanOrEqual(4);
    expect(100 - NPC_REST_DECAY_RATE * awake).toBeGreaterThan(NPC_REST_CRITICAL + 20);
  });

  test('social decays at NPC_SOCIAL_DECAY_RATE * socialDecayMult per second', () => {
    const npc = makeNPC({ social: 80, personality: 'stoic' });
    const { updates } = tickNPC(npc, 2, makeContext());
    // 80 - 0.15 * 0.5 * 2 = 79.85
    expect(updates.social).toBeCloseTo(79.85, 2);
  });

  test('social decays faster for non-stoic personalities', () => {
    const npc = makeNPC({ social: 80, personality: 'cheerful' });
    const { updates } = tickNPC(npc, 2, makeContext());
    // 80 - 0.15 * 1.0 * 2 = 79.7
    expect(updates.social).toBeCloseTo(79.7, 2);
  });

  test('needs are clamped to 0-100 range', () => {
    const npc = makeNPC({ hunger: 0.1, rest: 0.1, social: 0.1 });
    const { updates } = tickNPC(npc, 100, makeContext());
    expect(updates.hunger).toBe(0);
    expect(updates.rest).toBe(0);
    expect(updates.social).toBe(0);
  });
});

// ── Happiness formula ────────────────────────────────────────

describe('Happiness formula', () => {
  test('calculates happiness with correct weights', () => {
    const npc = makeNPC({ hunger: 100, rest: 100, social: 100, personality: 'stoic' });
    const { updates } = tickNPC(npc, 0.01, makeContext());
    // ~(100*0.35 + 100*0.3 + 100*0.2 + 15 + 0) = 100 (clamped)
    expect(updates.happiness).toBeCloseTo(100, 0);
  });

  test('cheerful personality adds +10 happiness', () => {
    const base = makeNPC({ hunger: 50, rest: 50, social: 50, personality: 'cheerful' });
    const cheerful = tickNPC(base, 0.01, makeContext());
    const stoic = tickNPC(makeNPC({ hunger: 50, rest: 50, social: 50, personality: 'stoic' }), 0.01, makeContext());
    expect(cheerful.updates.happiness - stoic.updates.happiness).toBeCloseTo(10, 0);
  });

  test('grumpy personality subtracts 10 happiness', () => {
    const base = makeNPC({ hunger: 50, rest: 50, social: 50, personality: 'grumpy' });
    const grumpy = tickNPC(base, 0.01, makeContext());
    const stoic = tickNPC(makeNPC({ hunger: 50, rest: 50, social: 50, personality: 'stoic' }), 0.01, makeContext());
    expect(grumpy.updates.happiness - stoic.updates.happiness).toBeCloseTo(-10, 0);
  });

  test('happiness is clamped to 0-100', () => {
    const npc = makeNPC({ hunger: 0, rest: 0, social: 0, personality: 'grumpy' });
    const { updates } = tickNPC(npc, 0.01, makeContext());
    expect(updates.happiness).toBeGreaterThanOrEqual(0);
  });
});

// ── APPROACHING state ────────────────────────────────────────

describe('APPROACHING state', () => {
  test('increments stateTimer when far from target', () => {
    const npc = makeNPC({ state: 'APPROACHING', stateTimer: 10, position: [100, 2, 100], targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.stateTimer).toBe(12);
  });

  test('does not detect arrival itself (SettlerNPC moves the NPC to EVALUATING)', () => {
    const npc = makeNPC({ state: 'APPROACHING', stateTimer: 5, position: [50.5, 2, 50.5], targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates).toEqual({ stateTimer: 7 });
  });

  test('gives up even if it is standing at the target once the timeout has passed', () => {
    const npc = makeNPC({ state: 'APPROACHING', stateTimer: 59, position: [50, 2, 50], targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('LEAVING');
  });

  test('transitions to LEAVING after 60s stuck', () => {
    const npc = makeNPC({ state: 'APPROACHING', stateTimer: 59, position: [100, 2, 100], targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('LEAVING');
    expect(updates.stateTimer).toBe(0);
    expect(updates.targetPosition).toBeDefined();
  });

  test('does not decay needs while APPROACHING', () => {
    const npc = makeNPC({ state: 'APPROACHING', hunger: 80, position: [100, 2, 100], targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.hunger).toBeUndefined();
  });

  test('handles null position gracefully', () => {
    const npc = makeNPC({ state: 'APPROACHING', stateTimer: 5, position: null, targetPosition: [50, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBeUndefined();
    expect(updates.stateTimer).toBe(7);
  });
});

// ── LEAVING state ────────────────────────────────────────────

describe('LEAVING state', () => {
  test('increments stateTimer when far from target', () => {
    const npc = makeNPC({ state: 'LEAVING', stateTimer: 10, position: [50, 2, 50], targetPosition: [200, 2, 200] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.stateTimer).toBe(12);
  });

  test('returns remove: true after 30s timeout', () => {
    const npc = makeNPC({ state: 'LEAVING', stateTimer: 29, position: [50, 2, 50], targetPosition: [200, 2, 200] });
    const result = tickNPC(npc, 2, makeContext());
    expect(result.remove).toBe(true);
  });

  test('is not removed just for reaching its target — only the timeout removes it', () => {
    const npc = makeNPC({ state: 'LEAVING', stateTimer: 5, position: [200, 2, 200], targetPosition: [201, 2, 201] });
    const result = tickNPC(npc, 2, makeContext());
    expect(result.remove).toBeUndefined();
    expect(result.updates).toEqual({ stateTimer: 7 });
  });

  test('does not return remove when far and before 30s', () => {
    const npc = makeNPC({ state: 'LEAVING', stateTimer: 10, position: [50, 2, 50], targetPosition: [200, 2, 200] });
    const result = tickNPC(npc, 2, makeContext());
    expect(result.remove).toBeUndefined();
  });
});

// ── EVALUATING state ─────────────────────────────────────────

describe('EVALUATING state', () => {
  test('joins settlement when attractiveness >= threshold after duration', () => {
    const npc = makeNPC({ state: 'EVALUATING', stateTimer: 7 });
    const ctx = makeContext({ attractiveness: 30 });
    const { updates, notifications } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('IDLE');
    expect(updates.stateTimer).toBe(0);
    expect(notifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'success', title: 'New Settler!' })])
    );
  });

  test('rejects and leaves when attractiveness < threshold', () => {
    const npc = makeNPC({ state: 'EVALUATING', stateTimer: 7 });
    const ctx = makeContext({ attractiveness: 5 });
    const { updates, notifications } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('LEAVING');
    expect(updates.targetPosition).toBeDefined();
    expect(notifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ type: 'warning', title: 'Settler Rejected' })])
    );
  });

  test('stays EVALUATING before duration expires', () => {
    const npc = makeNPC({ state: 'EVALUATING', stateTimer: 2 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBeUndefined(); // no state change
    expect(updates.stateTimer).toBe(4);
  });
});

// ── IDLE → EATING ────────────────────────────────────────────

describe('IDLE → EATING', () => {
  test('transitions to EATING when hunger < critical and food available', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10 });
    const ctx = makeContext();
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('EATING');
    expect(updates.stateTimer).toBe(0);
    expect(updates.eatingRestore).toBe(15);
    expect(updates.thoughtBubble).toEqual({ type: 'hungry', timer: NPC_THOUGHT_DURATION });
    expect(updates._hungryWarned).toBe(false);
    expect(ctx.host.removeMaterial).toHaveBeenCalledTimes(1);
    expect(ctx.host.removeMaterial).toHaveBeenCalledWith('meat', 1);
  });

  test('prefers meat over berry (priority order)', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10 });
    const ctx = makeContext({ inventory: { materials: { meat: 1, berry: 5 } } });
    tickNPC(npc, 2, ctx);
    expect(ctx.host.removeMaterial).toHaveBeenCalledWith('meat', 1);
  });

  test('falls back to berry when no meat', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10 });
    const ctx = makeContext({ inventory: { materials: { berry: 5 } } });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(ctx.host.removeMaterial).toHaveBeenCalledWith('berry', 1);
    expect(updates.eatingRestore).toBe(10);
  });

  test('eats from a stockpile before touching the player inventory', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10 });
    const stockpile = makeStockpile({ storage: { items: { berry: 3 }, capacity: 100, usedCapacity: 3 } });
    const ctx = makeContext({ zones: [stockpile], inventory: { materials: { meat: 5 } } });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('EATING');
    expect(updates.eatingRestore).toBe(10); // the stockpile's berry, not the inventory's meat
    expect(ctx.host.consumeFromStockpile).toHaveBeenCalledWith('stock_1', 'berry', 1);
    expect(ctx.host.removeMaterial).not.toHaveBeenCalled();
    expect(ctx.host.getZones()[0].storage.items.berry).toBe(2);
  });

  test('ignores stockpiles without storage and non-stockpile zones', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10 });
    const zones = [
      { id: 'mine_1', type: 'MINING', bounds: {}, storage: { items: { meat: 9 } } },
      makeStockpile({ storage: null }),
    ];
    const ctx = makeContext({ zones, inventory: { materials: { berry: 1 } } });
    tickNPC(npc, 2, ctx);
    expect(ctx.host.consumeFromStockpile).not.toHaveBeenCalled();
    expect(ctx.host.removeMaterial).toHaveBeenCalledWith('berry', 1);
  });

  test('stays IDLE and warns when no food available', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10, _hungryWarned: false });
    const ctx = makeContext({ inventory: { materials: {} } });
    const { updates, notifications } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBeUndefined(); // stays IDLE
    expect(ctx.host.removeMaterial).not.toHaveBeenCalled();
    expect(updates._hungryWarned).toBe(true);
    expect(notifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'No Food' })])
    );
  });

  test('warns about missing food only once', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10, _hungryWarned: true });
    const ctx = makeContext({ inventory: { materials: {} } });
    const { updates, notifications } = tickNPC(npc, 2, ctx);
    expect(notifications).toEqual([]);
    expect(updates._hungryWarned).toBeUndefined();
  });
});

// ── IDLE → SLEEPING ──────────────────────────────────────────

describe('IDLE → SLEEPING', () => {
  test('transitions to SLEEPING when rest < critical', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 80, rest: 10 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('SLEEPING');
    expect(updates.stateTimer).toBe(0);
  });

  test('hunger takes priority over rest', () => {
    const npc = makeNPC({ state: 'IDLE', hunger: 10, rest: 10 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('EATING'); // hunger first
  });
});

// ── IDLE → SOCIALIZING ───────────────────────────────────────

describe('IDLE → SOCIALIZING', () => {
  test('transitions to SOCIALIZING when social < critical and neighbor nearby', () => {
    const neighbor = makeNPC({ id: 'npc_2', position: [55, 2, 50], state: 'IDLE' });
    const npc = makeNPC({ state: 'IDLE', hunger: 80, rest: 80, social: 10 });
    const ctx = makeContext({ npcs: [npc, neighbor] });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('SOCIALIZING');
    expect(updates.targetPosition).toEqual(neighbor.position);
  });

  test('stays IDLE when social is low but no neighbor within 20 units', () => {
    const farNeighbor = makeNPC({ id: 'npc_2', position: [100, 2, 100], state: 'IDLE' });
    const npc = makeNPC({ state: 'IDLE', hunger: 80, rest: 80, social: 10 });
    const ctx = makeContext({ npcs: [npc, farNeighbor] });
    const { updates } = tickNPC(npc, 2, ctx);
    // Should not transition to SOCIALIZING (no neighbor within 20 units)
    // May wander or stay idle depending on timer
    expect(updates.state !== 'SOCIALIZING').toBe(true);
  });

  test('does not socialize with APPROACHING or LEAVING NPCs', () => {
    const leaving = makeNPC({ id: 'npc_2', position: [55, 2, 50], state: 'LEAVING' });
    const npc = makeNPC({ state: 'IDLE', hunger: 80, rest: 80, social: 10 });
    const ctx = makeContext({ npcs: [npc, leaving] });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state !== 'SOCIALIZING').toBe(true);
  });
});

// ── EATING → IDLE ────────────────────────────────────────────

describe('EATING → IDLE', () => {
  test('restores hunger over eating duration and transitions to IDLE', () => {
    const npc = makeNPC({ state: 'EATING', stateTimer: 2, eatingRestore: 15, hunger: 10 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('IDLE');
    expect(updates.stateTimer).toBe(0);
    expect(updates.hunger).toBeGreaterThan(10); // some restoration happened
  });

  test('hunger increases by (restore/duration)*tickDelta', () => {
    const npc = makeNPC({ state: 'EATING', stateTimer: 0, eatingRestore: 15, hunger: 10 });
    const { updates } = tickNPC(npc, 1, makeContext());
    // Hunger decays first, then the meal restores restore/duration per second
    expect(updates.hunger).toBeCloseTo(10 - NPC_HUNGER_DECAY_RATE + 15 / NPC_EATING_DURATION, 5);
  });
});

// ── SLEEPING → IDLE ──────────────────────────────────────────

describe('SLEEPING → IDLE', () => {
  test('restores rest at 8/sec and transitions to IDLE at rest >= 80', () => {
    const npc = makeNPC({ state: 'SLEEPING', rest: 72, stateTimer: 0 });
    const { updates } = tickNPC(npc, 2, makeContext());
    // rest decayed: 72 - 0.35*2 = 71.3, then restored: 71.3 + 8*2 = 87.3
    expect(updates.rest).toBeGreaterThanOrEqual(80);
    expect(updates.state).toBe('IDLE');
  });

  test('stays SLEEPING when rest < 80', () => {
    const npc = makeNPC({ state: 'SLEEPING', rest: 50, stateTimer: 0 });
    const { updates } = tickNPC(npc, 1, makeContext());
    // rest decayed: 50 - 0.35*1 = 49.65, restored: 49.65 + 8*1 = 57.65
    expect(updates.rest).toBeLessThan(80);
    expect(updates.state).toBeUndefined(); // stays SLEEPING
  });
});

// ── SOCIALIZING → IDLE ───────────────────────────────────────

describe('SOCIALIZING → IDLE', () => {
  test('transitions to IDLE after NPC_SOCIAL_DURATION', () => {
    const npc = makeNPC({ state: 'SOCIALIZING', stateTimer: 14, social: 50 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('IDLE');
    expect(updates.stateTimer).toBe(0);
    expect(updates.targetPosition).toBeNull();
  });

  test('restores social during socializing', () => {
    const npc = makeNPC({ state: 'SOCIALIZING', stateTimer: 0, social: 50 });
    const { updates } = tickNPC(npc, 2, makeContext());
    // social decayed: 50 - 0.15*0.5*2 = 49.85, restored: 49.85 + (20/15)*2 ≈ 52.52
    expect(updates.social).toBeGreaterThan(50);
  });
});

// ── WANDERING → IDLE ─────────────────────────────────────────

describe('WANDERING → IDLE', () => {
  test('transitions to IDLE after 15s', () => {
    const npc = makeNPC({ state: 'WANDERING', stateTimer: 14, position: [50, 2, 50], targetPosition: [60, 2, 60] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('IDLE');
    expect(updates.stateTimer).toBe(0);
    expect(updates.targetPosition).toBeNull();
  });

  test('transitions to IDLE when no target position', () => {
    const npc = makeNPC({ state: 'WANDERING', stateTimer: 2, targetPosition: null });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBe('IDLE');
  });

  test('keeps wandering near its target until SettlerNPC reports arrival', () => {
    const npc = makeNPC({ state: 'WANDERING', stateTimer: 3, position: [60, 2, 60], targetPosition: [60.5, 2, 60.5] });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.state).toBeUndefined();
    expect(updates.stateTimer).toBe(5);
  });
});

// ── Unhappy day tracking & departure ─────────────────────────

describe('Unhappy day tracking', () => {
  test('increments unhappyDays when happiness < threshold at day boundary', () => {
    const npc = makeNPC({
      state: 'IDLE',
      hunger: 0,
      rest: 0,
      social: 0,
      personality: 'grumpy',
      dayCheckpoint: 0,
      unhappyDays: 0,
    });
    const ctx = makeContext({ worldTimeElapsed: 1200 }); // DAY_LENGTH_SECONDS
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.unhappyDays).toBe(1);
    expect(updates.dayCheckpoint).toBe(1200);
  });

  test('decrements unhappyDays when happiness >= threshold', () => {
    const npc = makeNPC({
      state: 'IDLE',
      hunger: 80,
      rest: 80,
      social: 80,
      dayCheckpoint: 0,
      unhappyDays: 2,
    });
    const ctx = makeContext({ worldTimeElapsed: 1200 });
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.unhappyDays).toBe(1);
  });

  test('emits warning at NPC_LEAVE_WARNING_DAYS', () => {
    const warnedNPCs = new Set();
    const npc = makeNPC({
      state: 'IDLE',
      hunger: 0,
      rest: 0,
      social: 0,
      personality: 'grumpy',
      dayCheckpoint: 0,
      unhappyDays: 1, // will become 2 after this tick
    });
    const ctx = makeContext({ worldTimeElapsed: 1200, warnedNPCs });
    const { notifications } = tickNPC(npc, 2, ctx);
    expect(notifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Unhappy Settler' })])
    );
    expect(warnedNPCs.has('npc_1')).toBe(true);
  });

  test('NPC departs at NPC_LEAVE_DEPARTURE_DAYS', () => {
    const npc = makeNPC({
      state: 'IDLE',
      hunger: 0,
      rest: 0,
      social: 0,
      personality: 'grumpy',
      dayCheckpoint: 0,
      unhappyDays: 2, // will become 3 after this tick
    });
    const ctx = makeContext({ worldTimeElapsed: 1200 });
    const { updates, notifications } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBe('LEAVING');
    expect(updates.targetPosition).toBeDefined();
    expect(notifications).toEqual(
      expect.arrayContaining([expect.objectContaining({ title: 'Settler Leaving' })])
    );
  });

  test('does not check unhappy days before day boundary', () => {
    const npc = makeNPC({
      state: 'IDLE',
      hunger: 0,
      rest: 0,
      social: 0,
      dayCheckpoint: 0,
      unhappyDays: 0,
    });
    const ctx = makeContext({ worldTimeElapsed: 500 }); // < DAY_LENGTH_SECONDS
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.unhappyDays).toBeUndefined();
  });
});

// ── Thought bubbles ──────────────────────────────────────────

describe('Thought bubbles', () => {
  test('counts the bubble timer down each tick', () => {
    const npc = makeNPC({ state: 'EATING', stateTimer: 0, eatingRestore: 15, thoughtBubble: { type: 'hungry', timer: 4 } });
    const { updates } = tickNPC(npc, 1.5, makeContext());
    expect(updates.thoughtBubble).toEqual({ type: 'hungry', timer: 2.5 });
  });

  test('clears the bubble when its timer runs out', () => {
    const npc = makeNPC({ state: 'EATING', stateTimer: 0, eatingRestore: 15, thoughtBubble: { type: 'hungry', timer: 1 } });
    const { updates } = tickNPC(npc, 1.5, makeContext());
    expect(updates.thoughtBubble).toBeNull();
  });

  test('leaves thoughtBubble alone when the NPC has none', () => {
    const npc = makeNPC({ state: 'EATING', stateTimer: 0, eatingRestore: 15 });
    const { updates } = tickNPC(npc, 1.5, makeContext());
    expect('thoughtBubble' in updates).toBe(false);
  });

  test('going to sleep shows a sleeping bubble', () => {
    const npc = makeNPC({ state: 'IDLE', rest: 10 });
    const { updates } = tickNPC(npc, 2, makeContext());
    expect(updates.thoughtBubble).toEqual({ type: 'sleeping', timer: NPC_THOUGHT_DURATION });
  });

  test('starting to socialize shows a socializing bubble', () => {
    const npc = makeNPC({ state: 'IDLE', social: 5 });
    const other = makeNPC({ id: 'npc_2', position: [55, 2, 50] });
    const { updates } = tickNPC(npc, 2, makeContext({ npcs: [npc, other] }));
    expect(updates.state).toBe('SOCIALIZING');
    expect(updates.thoughtBubble).toEqual({ type: 'socializing', timer: NPC_THOUGHT_DURATION });
  });
});

// ── Unknown states ───────────────────────────────────────────

describe('Unknown states', () => {
  test('an unrecognised state only has its needs and timer ticked', () => {
    const npc = makeNPC({ state: 'HAULING', hunger: 10, rest: 10 });
    const ctx = makeContext();
    const { updates } = tickNPC(npc, 2, ctx);
    expect(updates.state).toBeUndefined();
    expect(updates.stateTimer).toBe(2);
    expect(ctx.host.removeMaterial).not.toHaveBeenCalled();
  });
});
