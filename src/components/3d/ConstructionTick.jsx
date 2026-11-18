/**
 * ConstructionTick — Invisible useFrame component that auto-places blocks
 * for construction sites (as far as their delivered materials pay for),
 * until the first settler joins.
 * From then on building is the settlers' job (BUILD tasks), so they're seen
 * doing it.
 *
 * Pattern: same as SurvivalTick, SettlementTick (accumulator-based tick).
 */

import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import useGameStore from '../../stores/useGameStore';
import { getBuildingById, parseLayers } from '../../data/buildings';
import { placeNextBlock, canPlaceNext } from '../../modules/settlement/buildingInfo';
import { CONSTRUCTION_BLOCK_INTERVAL } from '../../data/tuning';
import { siteHasNPCBuilder } from '../../systems/settlement/TaskAssignmentEngine';

/** Anyone settled in (not on their way in or out)? */
export function hasSettlers(npcs) {
  return (npcs || []).some((n) => n.arrivedAtSettlement && !['APPROACHING', 'EVALUATING', 'LEAVING'].includes(n.state));
}

export default function ConstructionTick({ chunkManager }) {
  const accumRef = useRef(0);

  useFrame((_, delta) => {
    if (!chunkManager) return;

    const store = useGameStore.getState();
    if (store.worldTime.paused) return;

    accumRef.current += delta;
    if (accumRef.current < CONSTRUCTION_BLOCK_INTERVAL) return;
    accumRef.current -= CONSTRUCTION_BLOCK_INTERVAL;

    // Settlers have arrived: they do the building
    if (hasSettlers(store.settlement?.npcs)) return;

    // One block per site per tick, as far as its delivered materials go
    // Skip sites being built by NPCs to prevent double block-placement
    for (const site of store.constructionSites) {
      if (site.status === 'COMPLETE' || !canPlaceNext(site)) continue;
      if (siteHasNPCBuilder(site.id)) continue;

      const building = getBuildingById(site.buildingId);
      if (!building) continue;

      const total = parseLayers(building).length;
      const nextIndex = site.blocksPlaced;
      if (nextIndex >= total) continue;

      placeNextBlock(site, chunkManager);
      store.advanceConstruction(site.id);

      // Check if this was the last block
      if (nextIndex + 1 >= total) {
        store.addPickupText('Building complete!', '#44ff44');
      }
    }
  });

  return null;
}
