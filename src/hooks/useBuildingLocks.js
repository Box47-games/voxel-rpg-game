/**
 * useBuildingLocks — { buildingId: lock } for every milestone-locked building
 * (data/unlocks.js), re-checked once a second while mounted. Settler counts
 * and rift states change outside React, so a selector would either miss them
 * or re-render every frame.
 */

import { useEffect, useState } from 'react';
import useGameStore from '../stores/useGameStore';
import { BUILDINGS } from '../data/buildings';
import { buildingLock } from '../data/unlocks';

const REFRESH_MS = 1000;

export function currentBuildingLocks(state) {
  const locks = {};
  for (const b of BUILDINGS) {
    const lock = buildingLock(b.id, state);
    if (lock) locks[b.id] = lock;
  }
  return locks;
}

const sameLocks = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function useBuildingLocks(active = true) {
  const [locks, setLocks] = useState(() => currentBuildingLocks(useGameStore.getState()));
  useEffect(() => {
    if (!active) return undefined;
    const check = () => {
      const next = currentBuildingLocks(useGameStore.getState());
      setLocks((prev) => (sameLocks(prev, next) ? prev : next));
    };
    check();
    const id = setInterval(check, REFRESH_MS);
    return () => clearInterval(id);
  }, [active]);
  return locks;
}
