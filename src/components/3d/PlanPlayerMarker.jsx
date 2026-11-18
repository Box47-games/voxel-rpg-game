/**
 * PlanPlayerMarker — In Plan mode the camera is high above the world and the
 * player is a dot; this draws a gold ring on the ground under them and a
 * thin beam above them that grow with the camera height, so they stay easy
 * to find.
 */

import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import useGameStore from '../../stores/useGameStore';

const RING_COLOR = '#f2c14e';
// Marker size per unit of plan camera height (keeps it about the same on screen)
const SCALE_PER_HEIGHT = 0.035;

const PlanPlayerMarker = () => {
  const planMode = useGameStore((s) => s.planMode);
  const group = useRef();
  const ring = useRef();

  useFrame(({ clock }) => {
    if (!group.current) return;
    const s = useGameStore.getState();
    const p = s.player.position;
    group.current.position.set(p[0], p[1] + 0.05, p[2]);
    const scale = Math.max(1, s.planCameraHeight * SCALE_PER_HEIGHT);
    group.current.scale.setScalar(scale);
    if (ring.current) {
      const pulse = 1 + 0.12 * Math.sin(clock.elapsedTime * 4);
      ring.current.scale.set(pulse, pulse, 1);
    }
  });

  if (!planMode) return null;

  return (
    <group ref={group} renderOrder={10}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.4, 2, 32]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0.9} depthTest={false} />
      </mesh>
      <mesh position={[0, 3, 0]}>
        <cylinderGeometry args={[0.18, 0.18, 6, 8]} />
        <meshBasicMaterial color={RING_COLOR} transparent opacity={0.55} depthTest={false} />
      </mesh>
    </group>
  );
};

export default PlanPlayerMarker;
