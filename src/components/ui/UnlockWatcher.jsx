/**
 * UnlockWatcher — announces new unlocks (data/unlocks.js): gear when the
 * player levels up, buildings when a settlement milestone is reached.
 * Checks once a second while playing; the first check after the intro,
 * the pause menu or a load only records what's already open.
 */

import { useEffect } from 'react';
import useGameStore from '../../stores/useGameStore';
import { CRAFTING_RECIPES } from '../../data/craftingRecipes';
import { BUILDINGS } from '../../data/buildings';
import { unlockedIds } from '../../data/unlocks';

const REFRESH_MS = 1000;
const RECIPES = Object.values(CRAFTING_RECIPES);
const BUILDING_IDS = BUILDINGS.map((b) => b.id);
const nameOf = (key) => {
  const [kind, id] = key.split(':');
  if (kind === 'recipe') return CRAFTING_RECIPES[id]?.name || id;
  return BUILDINGS.find((b) => b.id === id)?.name || id;
};

/** Notifications for the ids in `now` that weren't in `before`. */
export function unlockAnnouncements(before, now) {
  const fresh = [...now].filter((k) => !before.has(k));
  const gear = fresh.filter((k) => k.startsWith('recipe:')).map(nameOf);
  const buildings = fresh.filter((k) => k.startsWith('building:')).map(nameOf);
  const out = [];
  if (gear.length) {
    out.push({
      type: 'achievement',
      icon: '🔓',
      title: gear.length === 1 ? 'New recipe unlocked' : `${gear.length} new recipes unlocked`,
      description: `${gear.join(', ')}. Find ${gear.length === 1 ? 'it' : 'them'} in the Craft tab.`,
      duration: 6000,
    });
  }
  for (const name of buildings) {
    out.push({
      type: 'achievement',
      icon: '🏗',
      title: 'New building unlocked',
      description: `${name}. Find it in the Build catalog or Plan mode.`,
      duration: 6000,
    });
  }
  return out;
}

export default function UnlockWatcher() {
  useEffect(() => {
    // null = no baseline. Only playing → playing counts: the intro, the
    // pause menu (where saves load) and game over all reset the baseline.
    let known = null;
    const check = () => {
      const st = useGameStore.getState();
      if (st.gameState !== 'playing') {
        known = null;
        return;
      }
      const now = unlockedIds(st, RECIPES, BUILDING_IDS);
      if (known) for (const n of unlockAnnouncements(known, now)) window.addNotification?.(n);
      known = now;
    };
    const id = setInterval(check, REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return null;
}
