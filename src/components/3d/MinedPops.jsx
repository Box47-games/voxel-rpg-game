/**
 * MinedPops — When the player mines a block, a small 3D model of what they
 * got (a slab, plank, log, ore...) pops out of the block and flies to them.
 * Visual only: the material is already in the inventory.
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import useGameStore from '../../stores/useGameStore';
import { LootModel } from './pickups/pickupModels';

// Seconds: popping up out of the block, then flying to the player
const POP_TIME = 0.22;
const FLY_TIME = 0.38;
const POP_HEIGHT = 1.1;

function MinedPop({ id, position, material }) {
  const group = useRef();
  const age = useRef(0);

  useFrame((_, delta) => {
    const g = group.current;
    if (!g) return;
    const s = useGameStore.getState();
    if (s.gameState === 'paused') return;
    age.current += delta;
    const t = age.current;
    const [bx, by, bz] = position;
    if (t < POP_TIME) {
      const k = t / POP_TIME;
      g.position.set(bx, by + POP_HEIGHT * (1 - (1 - k) * (1 - k)), bz);
      g.scale.setScalar(0.6 + 0.4 * k);
    } else {
      const k = Math.min(1, (t - POP_TIME) / FLY_TIME);
      const ease = k * k;
      const p = s.player.position;
      const sx = bx, sy = by + POP_HEIGHT, sz = bz;
      g.position.set(sx + (p[0] - sx) * ease, sy + (p[1] + 1 - sy) * ease, sz + (p[2] - sz) * ease);
      g.scale.setScalar(1 - 0.6 * ease);
      if (k >= 1) s.removeMinedPop(id);
    }
    g.rotation.y = t * 7;
  });

  return (
    <group ref={group} position={position}>
      <LootModel material={material} />
    </group>
  );
}

const MinedPops = () => {
  const pops = useGameStore((s) => s.minedPops);
  return pops.map((p) => <MinedPop key={p.id} {...p} />);
};

export default MinedPops;
