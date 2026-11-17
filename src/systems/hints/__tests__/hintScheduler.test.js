import { pickHint } from '../hintScheduler';

const yes = () => true;
const state = (over = {}) => ({
  now: 100000, startedAt: 0, current: null, lastEndedAt: -Infinity,
  shown: new Set(), lastShown: new Map(), minGap: 25000, ...over,
});

describe('pickHint', () => {
  const a = { id: 'a', priority: 1, condition: yes, showOnce: true };
  const b = { id: 'b', priority: 2, condition: yes, showOnce: true };
  const hurt = { id: 'hurt', priority: 10, condition: yes, urgent: true, cooldown: 30000 };

  test('picks the highest-priority hint whose condition holds', () => {
    expect(pickHint([b, a], state()).id).toBe('a');
    expect(pickHint([b, { ...a, condition: () => false }], state()).id).toBe('b');
  });

  test('ordinary hints wait for the gap after the last one ended', () => {
    expect(pickHint([a], state({ lastEndedAt: 90000 }))).toBeNull();
    expect(pickHint([a], state({ lastEndedAt: 70000 })).id).toBe('a');
  });

  test('nothing ordinary replaces a hint that is showing', () => {
    expect(pickHint([b], state({ current: a }))).toBeNull();
  });

  test('urgent hints skip the gap and interrupt ordinary ones, but not each other', () => {
    expect(pickHint([a, hurt], state({ lastEndedAt: 99000 })).id).toBe('hurt');
    expect(pickHint([hurt], state({ current: a })).id).toBe('hurt');
    expect(pickHint([hurt], state({ current: { ...hurt, id: 'other' } }))).toBeNull();
  });

  test('showOnce, cooldown and delay', () => {
    expect(pickHint([a], state({ shown: new Set(['a']) }))).toBeNull();
    expect(pickHint([hurt], state({ lastShown: new Map([['hurt', 90000]]) }))).toBeNull();
    expect(pickHint([{ ...a, delay: 200000 }], state())).toBeNull();
  });
});
