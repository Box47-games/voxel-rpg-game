/**
 * hintScheduler.js — Decides which contextual hint (if any) to show next.
 * Pure: ContextualHints owns the timers and calls pickHint every check.
 *
 * Rules, so hints don't arrive one after another:
 *  - One hint at a time; ordinary hints wait HINT_MIN_GAP_MS after the last
 *    one finished.
 *  - Urgent hints (low health, hunger, nightfall) skip the gap and may
 *    replace an ordinary hint that's showing.
 *  - showOnce hints show once; others respect their own cooldown.
 *  - `delay` counts from when play started.
 */

/**
 * @param {object[]} hints - { id, priority, condition(), urgent?, showOnce?, cooldown?, delay? }
 * @param {object} s - scheduler state:
 *   { now, startedAt, current (hint|null), lastEndedAt, shown (Set), lastShown (Map), minGap }
 * @returns {object|null} the hint to show now, or null
 */
export function pickHint(hints, s) {
  const { now, startedAt, current, lastEndedAt = -Infinity, shown, lastShown, minGap } = s;
  // An ordinary hint can be interrupted only by an urgent one; an urgent one by nothing
  if (current?.urgent) return null;
  const gapOver = now - lastEndedAt >= minGap;
  const sorted = [...hints].sort((a, b) => a.priority - b.priority);
  for (const hint of sorted) {
    if (!hint.urgent && (current || !gapOver)) continue;
    if (hint.showOnce && shown.has(hint.id)) continue;
    if (hint.cooldown && now - (lastShown.get(hint.id) ?? -Infinity) < hint.cooldown) continue;
    if (hint.delay && now - startedAt < hint.delay) continue;
    if (current && current.id === hint.id) continue;
    if (!hint.condition()) continue;
    return hint;
  }
  return null;
}
