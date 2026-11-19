/**
 * spellBolts.jsx — What a spell looks like in flight: small voxel shapes
 * (a burning cluster, an ice shard, a crackling zigzag, an arcane core with
 * orbiting motes) aimed along the flight path, and a square beam for beams.
 *
 * Unlit materials, shared per colour, and no lights: adding and removing
 * point lights makes three.js recompile every lit material (a hitch per cast).
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const materials = new Map();

/** One shared unlit material per colour (and opacity). */
export function boltMaterial(color, opacity = 1) {
  const key = `${color}|${opacity}`;
  if (!materials.has(key)) {
    materials.set(key, new THREE.MeshBasicMaterial({
      color,
      transparent: opacity < 1,
      opacity,
      toneMapped: false,
    }));
  }
  return materials.get(key);
}

/** Which shape a spell flies as. */
export const BOLT_STYLE = {
  fireball: 'fire',
  meteor: 'fire',
  inferno: 'fire',
  iceShard: 'shard',
  frostNova: 'shard',
  lightning: 'spark',
  chainLightning: 'spark',
};

export function boltStyle(spellId) {
  return BOLT_STYLE[spellId] || 'orb';
}

const lighten = (hex, k) => `#${new THREE.Color(hex).lerp(new THREE.Color('#ffffff'), k).getHexString()}`;
const FORWARD = new THREE.Vector3(0, 0, 1);

/** A box: size [x, y, z] at pos, in the bolt's frame (+Z = direction of travel). */
const Cube = ({ size, pos = [0, 0, 0], color, opacity, rot }) => (
  <mesh geometry={UNIT_BOX} material={boltMaterial(color, opacity)} scale={size} position={pos} rotation={rot} />
);

function FireBolt({ color }) {
  const core = lighten(color, 0.55);
  return (
    <>
      <Cube size={[0.5, 0.5, 0.5]} color={color} rot={[0.6, 0.6, 0]} />
      <Cube size={[0.3, 0.3, 0.3]} color={core} pos={[0, 0, 0.05]} />
      <Cube size={[0.26, 0.26, 0.26]} color={color} opacity={0.75} pos={[0.08, 0.06, -0.45]} />
      <Cube size={[0.18, 0.18, 0.18]} color={color} opacity={0.5} pos={[-0.06, -0.04, -0.75]} />
      <Cube size={[0.12, 0.12, 0.12]} color="#5a4a40" opacity={0.45} pos={[0.04, 0.1, -1.0]} />
    </>
  );
}

function ShardBolt({ color }) {
  const edge = lighten(color, 0.6);
  return (
    <>
      <Cube size={[0.22, 0.22, 1.0]} color={color} rot={[0, 0, Math.PI / 4]} />
      <Cube size={[0.1, 0.1, 0.6]} color={edge} pos={[0, 0, 0.12]} rot={[0, 0, Math.PI / 4]} />
      <Cube size={[0.1, 0.1, 0.1]} color={edge} opacity={0.6} pos={[0.12, -0.08, -0.7]} />
    </>
  );
}

function SparkBolt({ color }) {
  const hot = lighten(color, 0.7);
  // A zigzag of thin segments along the path
  const zig = [[0, 0, 0.45], [0.16, 0.08, 0.15], [-0.12, -0.04, -0.15], [0.1, 0.1, -0.45]];
  return (
    <>
      {zig.map((p, i) => (
        <Cube key={i} size={[0.09, 0.09, 0.36]} color={i % 2 ? color : hot} pos={p} rot={[0, (i % 2 ? 1 : -1) * 0.7, 0]} />
      ))}
      <Cube size={[0.2, 0.2, 0.2]} color={hot} pos={[0, 0, 0.6]} />
    </>
  );
}

function OrbBolt({ color, spin }) {
  const core = lighten(color, 0.5);
  return (
    <>
      <Cube size={[0.36, 0.36, 0.36]} color={color} rot={[0.6, 0.6, 0]} />
      <Cube size={[0.2, 0.2, 0.2]} color={core} />
      <group ref={spin}>
        {[0, 1, 2, 3].map((i) => {
          const a = (i / 4) * Math.PI * 2;
          return <Cube key={i} size={[0.1, 0.1, 0.1]} color={core} pos={[Math.cos(a) * 0.38, Math.sin(a) * 0.38, 0]} />;
        })}
      </group>
    </>
  );
}

/**
 * A spell in flight, aimed along `direction`.
 * @param {{ spellId?: string, color: string, direction: number[], type?: string, beamWidth?: number }} props
 */
export function SpellBolt({ spellId, color, direction, type = 'projectile', beamWidth = 1 }) {
  const holder = useRef();
  const spin = useRef();
  const quaternion = useMemo(() => {
    const d = new THREE.Vector3(...direction);
    if (d.lengthSq() < 1e-6) d.set(0, 0, 1);
    return new THREE.Quaternion().setFromUnitVectors(FORWARD, d.normalize());
  }, [direction]);
  const style = type === 'beam' ? 'beam' : boltStyle(spellId);

  // Tumble around the path; sparks flicker
  useFrame((state, delta) => {
    if (holder.current) holder.current.rotation.z += delta * (style === 'spark' ? 0 : 6);
    if (spin.current) spin.current.rotation.z -= delta * 10;
    if (style === 'spark' && holder.current) {
      const s = 0.8 + Math.random() * 0.4;
      holder.current.scale.set(s, s, 1);
    }
  });

  return (
    <group quaternion={quaternion}>
      <group ref={holder}>
        {style === 'beam' && (
          <>
            <Cube size={[beamWidth, beamWidth, 3]} color={color} opacity={0.6} />
            <Cube size={[beamWidth * 0.45, beamWidth * 0.45, 3.1]} color={lighten(color, 0.6)} />
          </>
        )}
        {style === 'fire' && <FireBolt color={color} />}
        {style === 'shard' && <ShardBolt color={color} />}
        {style === 'spark' && <SparkBolt color={color} />}
        {style === 'orb' && <OrbBolt color={color} spin={spin} />}
      </group>
    </group>
  );
}
