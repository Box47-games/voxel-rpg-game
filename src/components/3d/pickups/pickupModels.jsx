/**
 * pickupModels.jsx — Voxel models for things lying on the ground to collect:
 * gold coins, material chunks, potions, and XP shards. Small, shared geometry
 * so a pile of loot stays cheap.
 */
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { pieceInfo, baseMaterial } from '../../../data/pieces';

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

// Colour of each material's loot (pieces use their block's)
const MATERIAL_COLORS = {
  wood: '#8a5a32', stone: '#8d8d8d', dirt: '#7a5233', iron: '#b9a08a', coal: '#3a3a3e',
  gold_ore: '#e0b94a', crystal: '#9b5de5', leather: '#a0673a', bone: '#e8e1cf',
  fiber: '#9bbf5a', berry: '#c8283c', meat: '#c4524a', sand: '#dccb8e', clay: '#a59fae',
  snow: '#eef3f7', seed: '#c8a36a',
};
export const materialColor = (m) => MATERIAL_COLORS[baseMaterial(m)] || '#88ff88';

const lighter = (color, t = 0.25) => '#' + new THREE.Color(color).lerp(new THREE.Color('#ffffff'), t).getHexString();
const darker = (color, t = 0.3) => '#' + new THREE.Color(color).lerp(new THREE.Color('#000000'), t).getHexString();

/** A piece as it looks in the world, small: a slab, a plank or a cube. */
export const PieceModel = ({ shape, color }) => {
  const top = useMemo(() => lighter(color), [color]);
  if (shape === 'plank') {
    return (
      <group rotation={[0.2, 0.5, 0.1]}>
        <Cube size={[0.66, 0.13, 0.22]} position={[0, 0, 0]} color={color} />
        <Cube size={[0.66, 0.02, 0.2]} position={[0, 0.07, 0]} color={top} />
      </group>
    );
  }
  if (shape === 'slab') {
    return (
      <group rotation={[0.25, 0.4, 0.1]}>
        <Cube size={[0.46, 0.22, 0.46]} position={[0, 0, 0]} color={color} />
        <Cube size={[0.44, 0.02, 0.44]} position={[0, 0.115, 0]} color={top} />
      </group>
    );
  }
  return (
    <group rotation={[0.35, 0.6, 0.2]}>
      <Cube size={[0.26, 0.26, 0.26]} position={[0, 0, 0]} color={color} />
    </group>
  );
};

/** A short log with lighter ends. */
const Log = ({ color }) => {
  const end = useMemo(() => lighter(color, 0.45), [color]);
  return (
    <group rotation={[0.2, 0.6, 0.15]}>
      <Cube size={[0.56, 0.26, 0.26]} position={[0, 0, 0]} color={darker(color, 0.1)} />
      <Cube size={[0.02, 0.2, 0.2]} position={[0.285, 0, 0]} color={end} />
      <Cube size={[0.02, 0.2, 0.2]} position={[-0.285, 0, 0]} color={end} />
    </group>
  );
};

/** A chunk of rock with flecks of ore in it. */
const Ore = ({ color, fleck }) => (
  <group rotation={[0.25, 0.4, 0.15]}>
    <Cube size={[0.38, 0.32, 0.36]} position={[0, -0.03, 0]} color="#77787c" />
    <Cube size={[0.12, 0.1, 0.02]} position={[0.06, 0.04, 0.185]} color={fleck || color} glow={0.4} />
    <Cube size={[0.02, 0.1, 0.1]} position={[0.195, -0.06, -0.05]} color={fleck || color} glow={0.4} />
    <Cube size={[0.1, 0.02, 0.1]} position={[-0.08, 0.135, -0.06]} color={fleck || color} glow={0.4} />
  </group>
);

/** Crystal shards, glowing. */
const Crystal = ({ color }) => (
  <group>
    <Cube size={[0.16, 0.42, 0.16]} rotation={[0, Math.PI / 4, 0.15]} position={[0, 0.02, 0]} color={color} glow={0.8} />
    <Cube size={[0.11, 0.26, 0.11]} rotation={[0.2, Math.PI / 4, -0.45]} position={[0.13, -0.06, 0.04]} color={lighter(color, 0.3)} glow={0.8} />
  </group>
);

/** A bone: a bar with knobbly ends. */
const Bone = ({ color }) => (
  <group rotation={[0.3, 0.5, 0.25]}>
    <Cube size={[0.46, 0.09, 0.09]} position={[0, 0, 0]} color={color} />
    <Cube size={[0.1, 0.17, 0.15]} position={[0.24, 0, 0]} color={color} />
    <Cube size={[0.1, 0.17, 0.15]} position={[-0.24, 0, 0]} color={color} />
  </group>
);

/** A few small round-ish pieces: berries or seeds. */
const Cluster = ({ color, size = 0.13 }) => (
  <group>
    <Cube size={[size, size, size]} position={[0, -0.05, 0]} color={color} glow={0.3} />
    <Cube size={[size, size, size]} position={[0.13, -0.08, 0.06]} color={darker(color, 0.15)} glow={0.3} />
    <Cube size={[size, size, size]} position={[-0.06, 0.06, 0.07]} color={lighter(color, 0.15)} glow={0.3} />
    <Cube size={[size * 0.4, size * 0.6, size * 0.4]} position={[-0.06, 0.15, 0.07]} color="#3f7a2c" />
  </group>
);

/** A folded strip (leather) or a tied bundle (fiber). */
const Bundle = ({ color, tie }) => (
  <group rotation={[0.2, 0.5, 0.05]}>
    <Cube size={[0.5, 0.1, 0.3]} position={[0, -0.04, 0]} color={color} />
    <Cube size={[0.44, 0.08, 0.26]} position={[0.02, 0.05, 0]} color={lighter(color, 0.12)} />
    {tie && <Cube size={[0.06, 0.22, 0.34]} position={[0, 0, 0]} color={tie} />}
  </group>
);

/**
 * The 3D loot for a material key: pieces as slabs, planks or cubes; wood as
 * a log; ores, crystal, bone, berries, leather and fiber as their own shapes;
 * anything else as a rough chunk in its colour.
 */
export const LootModel = ({ material, color }) => {
  const c = color || materialColor(material);
  const piece = pieceInfo(material);
  if (piece) return <PieceModel shape={piece.shape} color={c} />;
  switch (material) {
    case 'wood': return <Log color={c} />;
    case 'iron': return <Ore color={c} fleck="#d9b79a" />;
    case 'gold_ore': return <Ore color={c} fleck="#f2c14e" />;
    case 'coal': return <Ore color={c} fleck="#1c1c20" />;
    case 'crystal': return <Crystal color={c} />;
    case 'bone': return <Bone color={c} />;
    case 'berry': return <Cluster color={c} />;
    case 'seed': return <Cluster color={c} size={0.09} />;
    case 'leather': return <Bundle color={c} />;
    case 'fiber': return <Bundle color={c} tie="#6b5236" />;
    default: return <MaterialChunk color={c} />;
  }
};
