/**
 * pickupModels.jsx — Voxel models for things lying on the ground to collect:
 * gold coins, material chunks, potions, and XP shards. Small, shared geometry
 * so a pile of loot stays cheap.
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';

const box = new THREE.BoxGeometry(1, 1, 1);
const shadowGeo = new THREE.PlaneGeometry(1, 1);
shadowGeo.rotateX(-Math.PI / 2);

const matCache = new Map();
/** A lit material that still shows at night (a little self-glow). */
function voxelMat(color, glow = 0.25) {
  const key = `${color}|${glow}`;
  if (!matCache.has(key)) {
    const c = new THREE.Color(color);
    matCache.set(key, new THREE.MeshLambertMaterial({ color: c, emissive: c.clone().multiplyScalar(glow) }));
  }
  return matCache.get(key);
}

const shadowMat = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.28, depthWrite: false });

const Cube = ({ size, position, color, glow, rotation }) => (
  <mesh geometry={box} material={voxelMat(color, glow)} scale={size} position={position} rotation={rotation} />
);

/** A square shadow under a floating pickup. */
export const PickupShadow = ({ size = 0.7, y = -0.45 }) => (
  <mesh geometry={shadowGeo} material={shadowMat} scale={[size, 1, size]} position={[0, y, 0]} />
);

/** A small stack of gold coins. */
export const GoldCoins = () => (
  <group>
    <Cube size={[0.42, 0.09, 0.42]} position={[0, -0.12, 0]} color="#c9921f" />
    <Cube size={[0.4, 0.09, 0.4]} position={[0.05, -0.02, -0.03]} color="#e8b73a" />
    <Cube size={[0.38, 0.09, 0.38]} position={[-0.03, 0.08, 0.04]} color="#f7d25e" glow={0.35} />
    <Cube size={[0.08, 0.02, 0.08]} position={[0.06, 0.135, 0.1]} color="#fff6c8" glow={0.8} />
  </group>
);

/** A rough chunk of the material, in its own colour, with a lighter top. */
export const MaterialChunk = ({ color = '#8a8a8a' }) => {
  const top = useMemo(() => '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25).getHexString(), [color]);
  return (
    <group rotation={[0.25, 0.4, 0.15]}>
      <Cube size={[0.4, 0.34, 0.38]} position={[0, -0.04, 0]} color={color} />
      <Cube size={[0.24, 0.12, 0.22]} position={[0.04, 0.18, -0.02]} color={top} />
      <Cube size={[0.14, 0.14, 0.14]} position={[-0.19, -0.12, 0.13]} color={color} />
    </group>
  );
};

/** A small potion bottle: coloured body, glass neck, cork. */
export const Potion = ({ color = '#ff6b6b' }) => (
  <group>
    <Cube size={[0.34, 0.3, 0.34]} position={[0, -0.08, 0]} color={color} glow={0.45} />
    <Cube size={[0.14, 0.12, 0.14]} position={[0, 0.13, 0]} color="#cfe8f5" glow={0.2} />
    <Cube size={[0.17, 0.08, 0.17]} position={[0, 0.22, 0]} color="#8a5a32" />
  </group>
);

/** An XP shard: a glowing crystal (a cube turned onto its point). */
export const XPShard = () => (
  <group>
    <Cube size={[0.3, 0.3, 0.3]} rotation={[Math.PI / 4, 0, Math.PI / 4]} color="#f2c14e" glow={0.7} />
    <Cube size={[0.14, 0.14, 0.14]} rotation={[Math.PI / 4, 0, Math.PI / 4]} position={[0, 0, 0]} color="#fff6c8" glow={1} />
  </group>
);
