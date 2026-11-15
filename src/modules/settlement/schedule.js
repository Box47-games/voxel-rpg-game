/**
 * schedule.js — The settlers' daily routine: what each NPC should be doing at
 * a given time of day. The single source of truth for schedule timing.
 *
 *   Night   SUNSET_END → SUNRISE_START   SLEEP   (go home, sleep until dawn)
 *   Dawn    SUNRISE_START → work start   MEAL    (breakfast)
 *   Morning work start → lunch           WORK
 *   Midday  lunch                        MEAL
 *   Afternoon lunch end → work end       WORK
 *   Evening work end → SUNSET_END        LEISURE (dinner, socializing)
 *
 * Diligent settlers start work earlier and finish later; lazy ones the reverse.
 */

import {
  SUNRISE_START,
  SUNRISE_END,
  SUNSET_START,
  SUNSET_END,
  SCHEDULE_LUNCH_START,
  SCHEDULE_LUNCH_END,
  SCHEDULE_PERSONALITY_SHIFT,
  DAY_LENGTH_SECONDS,
} from '../../data/tuning.js';

export const Activity = {
  SLEEP: 'SLEEP',
  MEAL: 'MEAL',
  WORK: 'WORK',
  LEISURE: 'LEISURE',
};

function personalityShift(personality) {
  if (personality === 'diligent') return SCHEDULE_PERSONALITY_SHIFT;
  if (personality === 'lazy') return -SCHEDULE_PERSONALITY_SHIFT;
  return 0;
}

/**
 * The schedule block for a time of day.
 * @param {number} timeOfDay - 0–1 (0 = midnight)
 * @param {string} [personality]
 * @returns {{ activity: string, label: string }}
 */
export function getScheduleBlock(timeOfDay, personality) {
  const t = ((timeOfDay % 1) + 1) % 1;
  const shift = personalityShift(personality);
  // Work never starts before dawn or runs past full darkness
  const workStart = Math.max(SUNRISE_START, SUNRISE_END - shift);
  const workEnd = Math.min(SUNSET_END, SUNSET_START + shift);

  if (t >= SUNSET_END || t < SUNRISE_START) return { activity: Activity.SLEEP, label: 'Night' };
  if (t < workStart) return { activity: Activity.MEAL, label: 'Dawn' };
  if (t < SCHEDULE_LUNCH_START) return { activity: Activity.WORK, label: 'Morning shift' };
  if (t < SCHEDULE_LUNCH_END) return { activity: Activity.MEAL, label: 'Lunch break' };
  if (t < workEnd) return { activity: Activity.WORK, label: 'Afternoon shift' };
  return { activity: Activity.LEISURE, label: 'Evening' };
}

/** Time of day from world time, using the store's value when it has one. */
export function getTimeOfDay(worldTime) {
  if (typeof worldTime?.timeOfDay === 'number') return worldTime.timeOfDay;
  const elapsed = worldTime?.elapsed || 0;
  return (elapsed % DAY_LENGTH_SECONDS) / DAY_LENGTH_SECONDS;
}
