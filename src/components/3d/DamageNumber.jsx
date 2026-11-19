import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { pixelTextTexture } from './pixelText';
// NOTE: drei Text caused WebGL shader errors that corrupted the rendering
// pipeline; the label is a plain three.js sprite with a pixel-font texture.

const HEIGHT = 0.42; // world units for a normal number
const RISE = 2; // units per second
const LIFE = 1; // seconds

/** Colour of a label: crits gold, combos cyan, heals green, damage red. */
export function damageColor(damage, colorProp) {
  if (colorProp) return colorProp;
  const text = String(damage);
  if (text.includes('CRIT')) return '#ffd977';
  if (text.includes('COMBO')) return '#7fe3ff';
  if (text.startsWith('+')) return '#7fcb62';
  return '#ff6a5a';
}

/**
 * A floating number (or short label) in pixel digits: pops in, rises and fades.
 */
const DamageNumber = ({ position, damage, color: colorProp, id, onComplete }) => {
  const spriteRef = useRef();
  const age = useRef(0);
  const done = useRef(false);

  const text = String(damage);
  const isCrit = text.includes('CRIT');
  const color = damageColor(damage, colorProp);
  const { texture, aspect } = pixelTextTexture(text, color);
  const material = useMemo(
    () => new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false, toneMapped: false }),
    [texture]
  );
  useEffect(() => () => material.dispose(), [material]);

  const height = HEIGHT * (isCrit ? 1.4 : 1);

  useFrame((state, delta) => {
    const sprite = spriteRef.current;
    if (!sprite || done.current) return;
    age.current += delta;
    const t = age.current;

    sprite.position.y = position[1] + t * RISE * (1 - t * 0.35);
    // Pop in, then settle
    const pop = t < 0.12 ? 0.6 + (t / 0.12) * 0.6 : 1.2 - Math.min(0.2, (t - 0.12) * 0.8);
    sprite.scale.set(height * aspect * pop, height * pop, 1);
    material.opacity = Math.max(0, 1 - Math.max(0, t - LIFE * 0.45) / (LIFE * 0.55));

    if (t >= LIFE) {
      done.current = true;
      onComplete(id);
    }
  });

  return (
    <sprite
      ref={spriteRef}
      material={material}
      position={[position[0], position[1], position[2]]}
      scale={[height * aspect * 0.6, height * 0.6, 1]}
      renderOrder={10}
    />
  );
};

export default DamageNumber;
