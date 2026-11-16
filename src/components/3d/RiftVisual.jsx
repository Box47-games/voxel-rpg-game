/**
 * RiftVisual.jsx — A rift: an upright tear in the world, in the game's voxel style
 * (it matches the rift on the app icon).
 *
 *   - The tear: a pixelated swirl of violet, magenta and a white-hot core with
 *     a jagged rim. It turns to face the camera, so it always reads as a portal.
 *   - Dark crystal voxels frame its edge and bob slowly.
 *   - Voxel debris spirals up from the ground and is pulled into the core.
 *   - The ground around it is scorched, with glowing cracks and crystal spikes.
 *
 * States:
 *   ACTIVE:  full size and glow
 *   CLOSING: shrinks with corruptionProgress and turns gold; a ring of gold
 *            voxels (the purification anchor) spins at its base, fading with
 *            anchorHealth
 *   WOUNDED: half size, flickering
 *   CLOSED:  not rendered (filtered out before reaching this component)
 *
 * Draw calls: tear, ground, 3 instanced meshes (+1 while closing), 1 light.
 */

import React, { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';

const TEAR_W = 5;
const TEAR_H = 10;
const TEAR_Y = 6.5; // centre of the tear above the ground
const GROUND_R = 9;
const FRAME_COUNT = 22;
const DEBRIS_COUNT = 36;
const SPIKE_COUNT = 9;
const ANCHOR_COUNT = 12;

// ── Shared geometry and materials (one copy for every rift) ──
const tearGeo = new THREE.PlaneGeometry(TEAR_W, TEAR_H);
const groundGeo = new THREE.CircleGeometry(GROUND_R, 32);
groundGeo.rotateX(-Math.PI / 2);
const cubeGeo = new THREE.BoxGeometry(1, 1, 1);

const crystalMat = new THREE.MeshLambertMaterial({ color: '#ffffff', emissive: '#2a0f45' });
const debrisMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, depthWrite: false });

const TEAR_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Pixelated swirl inside a jagged ellipse.
const TEAR_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uIntensity;
  uniform float uGold;   // 0 = violet rift, 1 = purified gold
  uniform float uFlicker;
  varying vec2 vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  void main() {
    // Snap to a pixel grid so the tear looks like it is made of voxels
    vec2 grid = vec2(20.0, 40.0);
    vec2 uv = (floor(vUv * grid) + 0.5) / grid;
    vec2 p = uv * 2.0 - 1.0;            // ellipse of radius 1 in both axes
    float len = length(p);
    float ang = atan(p.y, p.x);

    // Jagged rim: a few teeth that drift slowly
    float teeth = floor((ang + 3.1416) / 6.2832 * 14.0);
    float jag = hash(teeth + floor(uTime * 0.7)) * 0.16 + sin(ang * 3.0 + uTime) * 0.04;
    float r = 0.94 - jag;
    if (len > r) discard;

    // Swirl bands spinning into the core
    float swirl = sin(ang * 4.0 + (1.0 - len) * 9.0 - uTime * 2.6);
    float bands = smoothstep(0.1, 0.9, swirl * 0.5 + 0.5);
    float core = smoothstep(0.55, 0.0, len);
    float rim = smoothstep(r - 0.22, r - 0.02, len);

    vec3 deep = vec3(0.16, 0.03, 0.30);
    vec3 violet = vec3(0.55, 0.16, 0.95);
    vec3 magenta = vec3(0.95, 0.30, 0.95);
    vec3 white = vec3(1.0, 0.92, 1.0);
    vec3 col = mix(deep, violet, bands * (1.0 - len * 0.6));
    col = mix(col, magenta, rim * 0.85);
    col = mix(col, white, core * core);

    vec3 gold = mix(vec3(0.45, 0.28, 0.05), vec3(1.0, 0.85, 0.45), bands * 0.5 + core);
    col = mix(col, gold, uGold);

    // Opaque enough to read as a hole by day; the bright rim and core carry the glow
    float glow = (0.75 + 0.25 * max(bands, core) + rim * 0.3) * uIntensity;
    gl_FragColor = vec4(col * glow, 0.94 * (1.0 - uFlicker));
  }
`;

// Scorched ground with glowing cracks, fading out at the edge
const GROUND_FRAG = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uGlow;
  varying vec2 vUv;

  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

  void main() {
    vec2 grid = vec2(36.0);
    vec2 cell = floor(vUv * grid);
    vec2 p = (cell + 0.5) / grid * 2.0 - 1.0;
    float d = length(p) / max(uScale, 0.001);
    if (d > 1.0) discard;

    float ang = atan(p.y, p.x);
    // Radial cracks: thin wedges at fixed angles, wobbling outward
    float spokes = abs(sin(ang * 5.0 + sin(d * 9.0) * 0.6));
    float crack = step(spokes, 0.12) * step(0.12, d);
    // A ring crack two thirds of the way out
    crack = max(crack, step(abs(d - 0.62 - sin(ang * 7.0) * 0.03), 0.025));
    float speck = step(0.97, hash(cell));

    vec3 base = mix(vec3(0.05, 0.02, 0.08), vec3(0.11, 0.05, 0.15), hash(cell) * 0.6);
    float pulse = 0.65 + 0.35 * sin(uTime * 1.8 - d * 6.0);
    vec3 glow = vec3(0.72, 0.25, 1.0) * pulse * uGlow;
    vec3 col = base + glow * max(crack, speck * 0.5) * (1.0 - d * 0.4);

    float alpha = smoothstep(1.0, 0.7, d) * 0.92;
    gl_FragColor = vec4(col, alpha);
  }
`;

/** Deterministic random numbers from the rift's position (same look every load). */
function seeded(x, z) {
  let s = (Math.floor(x) * 73856093) ^ (Math.floor(z) * 19349663);
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return ((s >>> 0) % 10000) / 10000;
  };
}

const m4 = new THREE.Matrix4();
const pos = new THREE.Vector3();
const quat = new THREE.Quaternion();
const scl = new THREE.Vector3();
const eul = new THREE.Euler();
const col = new THREE.Color();

const RiftVisual = ({
  x, y = 0.1, z, isNight,
  state = 'ACTIVE',
  corruptionProgress = 1.0,
  anchorHealth = 0,
}) => {
  const tearGroupRef = useRef();
  const frameRef = useRef();
  const debrisRef = useRef();
  const spikesRef = useRef();
  const anchorRef = useRef();
  const lightRef = useRef();

  const isClosing = state === 'CLOSING';
  const isWounded = state === 'WOUNDED';
  const scale = isClosing ? 0.3 + corruptionProgress * 0.7 : (isWounded ? 0.5 : 1.0);
  const anchorOpacity = isClosing ? (anchorHealth / 100) * 0.8 + 0.2 : 0;

  const tearMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: TEAR_VERT,
    fragmentShader: TEAR_FRAG,
    uniforms: { uTime: { value: 0 }, uIntensity: { value: 1 }, uGold: { value: 0 }, uFlicker: { value: 0 } },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  }), []);

  const anchorMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: '#ffd166', transparent: true, depthWrite: false }),
    []
  );

  const groundMat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: TEAR_VERT,
    fragmentShader: GROUND_FRAG,
    uniforms: { uTime: { value: 0 }, uScale: { value: 1 }, uGlow: { value: 1 } },
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  }), []);

  // Fixed layout per rift: frame shards on the rim, spikes around the base
  const layout = useMemo(() => {
    const rand = seeded(x, z);
    const frame = Array.from({ length: FRAME_COUNT }, (_, i) => {
      const a = (i / FRAME_COUNT) * Math.PI * 2 + rand() * 0.15;
      const out = 1.0 + rand() * 0.18;
      return {
        x: Math.cos(a) * (TEAR_W / 2) * out,
        y: Math.sin(a) * (TEAR_H / 2) * out,
        size: 0.45 + rand() * 0.55,
        spin: rand() * Math.PI,
        phase: rand() * Math.PI * 2,
        tint: rand(),
      };
    });
    const spikes = Array.from({ length: SPIKE_COUNT }, (_, i) => {
      const a = (i / SPIKE_COUNT) * Math.PI * 2 + rand() * 0.5;
      const r = 3.5 + rand() * 4.5;
      return {
        x: Math.cos(a) * r,
        z: Math.sin(a) * r,
        h: 1.2 + rand() * 2.6,
        w: 0.45 + rand() * 0.4,
        tiltX: (rand() - 0.5) * 0.7,
        tiltZ: (rand() - 0.5) * 0.7,
        yaw: rand() * Math.PI,
        tint: rand(),
      };
    });
    const debris = Array.from({ length: DEBRIS_COUNT }, () => ({
      offset: rand(),
      start: rand() * Math.PI * 2,
      size: 0.18 + rand() * 0.3,
    }));
    return { frame, spikes, debris };
  }, [x, z]);

  // Spikes don't move: place them once
  const placeSpikes = (mesh) => {
    spikesRef.current = mesh;
    if (!mesh) return;
    layout.spikes.forEach((s, i) => {
      pos.set(s.x, s.h / 2 - 0.3, s.z);
      quat.setFromEuler(eul.set(s.tiltX, s.yaw, s.tiltZ));
      scl.set(s.w, s.h, s.w);
      mesh.setMatrixAt(i, m4.compose(pos, quat, scl));
      mesh.setColorAt(i, col.setRGB(0.22 + s.tint * 0.12, 0.12, 0.32 + s.tint * 0.15));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  // Frame shards keep their colour; set it once
  const placeFrame = (mesh) => {
    frameRef.current = mesh;
    if (!mesh) return;
    layout.frame.forEach((f, i) => {
      mesh.setColorAt(i, col.setRGB(0.18 + f.tint * 0.1, 0.08, 0.28 + f.tint * 0.12));
    });
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  useFrame(({ camera, clock }) => {
    if (useGameStore.getState().gameState === 'paused') return;
    const t = clock.elapsedTime;
    const day = isNight ? 1 : 0.9;

    // Tear faces the camera (turning about the vertical axis only)
    if (tearGroupRef.current) {
      tearGroupRef.current.rotation.y = Math.atan2(camera.position.x - x, camera.position.z - z);
    }
    const flicker = isWounded ? (Math.sin(t * 23) > 0.6 ? 0.55 : 0) : 0;
    tearMat.uniforms.uTime.value = t;
    tearMat.uniforms.uIntensity.value = day;
    tearMat.uniforms.uGold.value = isClosing ? 1 - corruptionProgress * 0.6 : 0;
    tearMat.uniforms.uFlicker.value = flicker;
    groundMat.uniforms.uTime.value = t;
    groundMat.uniforms.uScale.value = scale;
    groundMat.uniforms.uGlow.value = isClosing ? corruptionProgress : 1;

    // Frame shards bob and turn on the rim
    const frame = frameRef.current;
    if (frame) {
      layout.frame.forEach((f, i) => {
        const bob = Math.sin(t * 1.3 + f.phase) * 0.15;
        pos.set(f.x, f.y + bob, Math.sin(t + f.phase) * 0.2);
        quat.setFromEuler(eul.set(f.spin + t * 0.3, f.spin, f.spin * 0.5));
        scl.setScalar(f.size);
        frame.setMatrixAt(i, m4.compose(pos, quat, scl));
      });
      frame.instanceMatrix.needsUpdate = true;
    }

    // Debris spirals in from the ground to the core, shrinking as it goes
    const debris = debrisRef.current;
    if (debris) {
      layout.debris.forEach((d, i) => {
        const k = (d.offset + t * 0.12) % 1; // 0 on the ground → 1 at the core
        const a = d.start + k * Math.PI * 3;
        const r = (1 - k) * 7.5 + 0.3;
        pos.set(Math.cos(a) * r, 0.4 + k * TEAR_Y, Math.sin(a) * r);
        quat.setFromEuler(eul.set(t + i, t * 1.5 + i, 0));
        scl.setScalar(d.size * (1 - k * 0.7));
        debris.setMatrixAt(i, m4.compose(pos, quat, scl));
        const glow = 0.4 + k * 0.6;
        if (isClosing) debris.setColorAt(i, col.setRGB(glow, glow * 0.8, glow * 0.35));
        else debris.setColorAt(i, col.setRGB(0.65 * glow, 0.25 * glow, glow));
      });
      debris.material.opacity = 0.85 * day;
      debris.instanceMatrix.needsUpdate = true;
      if (debris.instanceColor) debris.instanceColor.needsUpdate = true;
    }

    // Purification anchor: a ring of gold voxels
    const anchor = anchorRef.current;
    if (anchor) {
      for (let i = 0; i < ANCHOR_COUNT; i++) {
        const a = (i / ANCHOR_COUNT) * Math.PI * 2 + t * 1.2;
        pos.set(Math.cos(a) * 3, 1.5 + Math.sin(t * 2 + i) * 0.2, Math.sin(a) * 3);
        quat.setFromEuler(eul.set(t, a, 0));
        scl.setScalar(0.55);
        anchor.setMatrixAt(i, m4.compose(pos, quat, scl));
      }
      anchor.material.opacity = anchorOpacity;
      anchor.instanceMatrix.needsUpdate = true;
    }

    if (lightRef.current) {
      lightRef.current.intensity = ((isNight ? 5 : 1.5) + Math.sin(t * 2) * 0.6) * scale * (1 - flicker);
    }
  });

  return (
    <group position={[x, y, z]}>
      <mesh geometry={groundGeo} material={groundMat} position={[0, 0.06, 0]} renderOrder={1} />

      <instancedMesh ref={placeSpikes} args={[cubeGeo, crystalMat, SPIKE_COUNT]} scale={[scale, scale, scale]} />

      <group position={[0, TEAR_Y * scale, 0]} scale={[scale, scale, scale]}>
        <group ref={tearGroupRef}>
          <mesh geometry={tearGeo} material={tearMat} renderOrder={2} />
          <instancedMesh ref={placeFrame} args={[cubeGeo, crystalMat, FRAME_COUNT]} frustumCulled={false} />
        </group>
      </group>

      <instancedMesh
        ref={debrisRef}
        args={[cubeGeo, debrisMat, DEBRIS_COUNT]}
        scale={[scale, scale, scale]}
        frustumCulled={false}
      />

      {isClosing && (
        <instancedMesh ref={anchorRef} args={[cubeGeo, anchorMat, ANCHOR_COUNT]} frustumCulled={false} />
      )}

      <pointLight
        ref={lightRef}
        color={isClosing ? '#ffcc66' : '#a64dff'}
        intensity={(isNight ? 5 : 1.5) * scale}
        distance={26}
        decay={2}
        position={[0, TEAR_Y * scale, 0]}
      />
    </group>
  );
};

export default React.memo(RiftVisual);
