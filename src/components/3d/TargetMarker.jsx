import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const ARM = 0.42; // length of each bracket arm
const BAR = 0.12; // bracket thickness
const HALF = 0.7; // half the bracket square's width

// Four L-shaped corner brackets, flat on the ground (x, z)
const BRACKETS = [[1, 1], [1, -1], [-1, 1], [-1, -1]].flatMap(([sx, sz]) => [
  { pos: [sx * (HALF - ARM / 2), 0, sz * HALF], size: [ARM, BAR, BAR] },
  { pos: [sx * HALF, 0, sz * (HALF - ARM / 2)], size: [BAR, BAR, ARM] },
]);

/**
 * Where the player tapped, clicked or hit: four pixel corner brackets that
 * close in on the spot, turn slowly and fade, with a small centre block.
 */
const TargetMarker = ({ position, duration = 2, color = '#00ff00', id, onComplete }) => {
  const groupRef = useRef();
  const timeRef = useRef(0);
  const [completed, setCompleted] = useState(false);
  const material = useMemo(
    () => new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 1, toneMapped: false }),
    [color]
  );
  useEffect(() => () => material.dispose(), [material]);

  useFrame((state, delta) => {
    if (!groupRef.current || completed) return;
    timeRef.current += delta;
    const t = timeRef.current;

    material.opacity = Math.max(0, 1 - t / duration);
    // Snap in from wide to tight in the first quarter second, then breathe
    const close = t < 0.25 ? 1.6 - (t / 0.25) * 0.6 : 1 + Math.sin(t * 6) * 0.05;
    groupRef.current.scale.set(close, 1, close);
    groupRef.current.rotation.y += delta * 0.8;

    if (t >= duration && !completed) {
      setCompleted(true);
      if (onComplete && id) onComplete(id);
    }
  });

  if (completed) return null;

  return (
    <group ref={groupRef} position={[position[0], position[1] + 0.1, position[2]]}>
      {BRACKETS.map((b, i) => (
        <mesh key={i} geometry={UNIT_BOX} material={material} position={b.pos} scale={b.size} />
      ))}
      <mesh geometry={UNIT_BOX} material={material} scale={[0.16, 0.08, 0.16]} />
    </group>
  );
};

export default TargetMarker;
