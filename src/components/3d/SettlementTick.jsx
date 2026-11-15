/**
 * SettlementTick — Invisible tick component (returns null) that drives the
 * settlement simulation each frame.
 *
 * It owns no game logic. It creates the headless SettlementModule, publishes it
 * on the store (`_settlementModule`), and runs it through a SettlementBridge:
 *
 *   useFrame → bridge.tick(delta) → SettlementModule.tickSettlementCore()
 *
 * Campfire detection, attractiveness, immigration, NPC needs and the work loop
 * all live in src/modules/settlement/.
 */

import { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import useGameStore from '../../stores/useGameStore';
import SettlementModule from '../../modules/settlement/SettlementModule';
import SettlementBridge from '../../modules/settlement/SettlementBridge';

export default function SettlementTick({ chunkManager }) {
  const bridgeRef = useRef(null);

  // One module + bridge per mount. The module only holds timers and other
  // throwaway state — everything that is saved lives in the store.
  useEffect(() => {
    const module = new SettlementModule();
    module.initialize();
    bridgeRef.current = new SettlementBridge(module);
    useGameStore.getState().setSettlementModule(module);

    return () => {
      bridgeRef.current = null;
      if (useGameStore.getState()._settlementModule === module) {
        useGameStore.getState().setSettlementModule(null);
      }
    };
  }, []);

  // Give the module world access once the chunk system is ready
  useEffect(() => {
    if (bridgeRef.current && chunkManager) {
      bridgeRef.current.setChunkAdapter(chunkManager);
    }
  }, [chunkManager]);

  useFrame((_, delta) => {
    const bridge = bridgeRef.current;
    if (!bridge || !chunkManager) return;
    if (useGameStore.getState().gameState !== 'playing') return;
    bridge.tick(delta);
  });

  return null;
}
