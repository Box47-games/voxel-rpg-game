/**
 * SkyDome.jsx — The sky: a gradient dome (deep overhead, pale at the
 * horizon, glowing around the sun), stars that fade in at night, and
 * drifting voxel clouds. Everything follows the camera and ignores fog.
 *
 * Colors come from DayNightLighting (getLightingState), driven by the
 * world time DayNightCycle writes to the store.
 */

import React, { useMemo, useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { getLightingState } from '../../systems/lighting/DayNightLighting';

const DOME_RADIUS = 480; // inside the camera's far plane (1000), beyond fog (400)
const STAR_COUNT = 500;
const CLOUD_COUNT = 26;
const CLOUD_HEIGHT = 110;
const CLOUD_FIELD = 700; // clouds wrap around within this square around the camera
const WIND = [1.6, 0, 0.6]; // world units per second

const skyVertex = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vDir = normalize(position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

const skyFragment = /* glsl */ `
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSunColor;
  uniform vec3 uSunDir;
  uniform float uSunGlow;
  varying vec3 vDir;
  void main() {
    vec3 dir = normalize(vDir);
    float h = clamp(dir.y, 0.0, 1.0);
    vec3 color = mix(uHorizon, uZenith, pow(h, 0.55));
    // Soft glow around the sun, strongest near the horizon at dawn and dusk
    float sun = max(dot(dir, normalize(uSunDir)), 0.0);
    color += uSunColor * (pow(sun, 12.0) * 0.35 + pow(sun, 200.0) * 0.6) * uSunGlow;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

/** Deterministic pseudo-random in [0, 1) for star and cloud layouts. */
function rand(i, salt) {
  const x = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

/** Star positions on the upper dome. */
function buildStars() {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = rand(i, 1) * Math.PI * 2;
    const y = 0.08 + rand(i, 2) * 0.92; // above the horizon
    const r = Math.sqrt(1 - y * y);
    positions[i * 3] = Math.cos(theta) * r * (DOME_RADIUS - 10);
    positions[i * 3 + 1] = y * (DOME_RADIUS - 10);
    positions[i * 3 + 2] = Math.sin(theta) * r * (DOME_RADIUS - 10);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

/**
 * Cloud layouts: each cloud is a few flat boxes clustered together.
 * @returns {Array<{ x, z, parts: Array<[ox, oy, oz, sx, sy, sz]> }>}
 */
export function buildClouds(count = CLOUD_COUNT) {
  const clouds = [];
  for (let i = 0; i < count; i++) {
    const parts = [];
    const size = 14 + rand(i, 3) * 26;
    const blobs = 3 + Math.floor(rand(i, 4) * 4);
    for (let b = 0; b < blobs; b++) {
      const sx = size * (0.5 + rand(i * 7 + b, 5) * 0.6);
      const sz = size * (0.35 + rand(i * 7 + b, 6) * 0.45);
      parts.push([
        (rand(i * 7 + b, 7) - 0.5) * size * 1.2,
        (b % 2) * 3,
        (rand(i * 7 + b, 8) - 0.5) * size * 0.8,
        sx, 4 + rand(i * 7 + b, 9) * 3, sz,
      ]);
    }
    clouds.push({ x: (rand(i, 10) - 0.5) * CLOUD_FIELD, z: (rand(i, 11) - 0.5) * CLOUD_FIELD, parts });
  }
  return clouds;
}

/** Wrap v into [-half, half) around center c. */
function wrap(v, c, half) {
  const span = half * 2;
  return ((((v - c + half) % span) + span) % span) - half + c;
}

const SkyDome = () => {
  const domeRef = useRef();
  const starsRef = useRef();
  const cloudsRef = useRef();
  const windOffset = useRef([0, 0]);

  const skyMaterial = useMemo(() => new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uSunColor: { value: new THREE.Color() },
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunGlow: { value: 1 },
    },
    vertexShader: skyVertex,
    fragmentShader: skyFragment,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
  }), []);
  const domeGeometry = useMemo(() => new THREE.SphereGeometry(DOME_RADIUS, 32, 16), []);
  const starGeometry = useMemo(buildStars, []);
  const starMaterial = useMemo(() => new THREE.PointsMaterial({
    color: '#ffffff', size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false,
  }), []);

  // Clouds: one instanced box mesh for every blob of every cloud
  const clouds = useMemo(() => buildClouds(), []);
  const blobCount = useMemo(() => clouds.reduce((n, c) => n + c.parts.length, 0), [clouds]);
  const cloudGeometry = useMemo(() => new THREE.BoxGeometry(1, 1, 1), []);
  const cloudMaterial = useMemo(() => new THREE.MeshBasicMaterial({
    color: '#ffffff', transparent: true, opacity: 0.88, fog: false, depthWrite: false,
  }), []);

  useEffect(() => () => {
    skyMaterial.dispose();
    domeGeometry.dispose();
    starGeometry.dispose();
    starMaterial.dispose();
    cloudGeometry.dispose();
    cloudMaterial.dispose();
  }, [skyMaterial, domeGeometry, starGeometry, starMaterial, cloudGeometry, cloudMaterial]);

  const _matrix = useMemo(() => new THREE.Matrix4(), []);
  const _cloudColor = useMemo(() => new THREE.Color(), []);
  const _white = useMemo(() => new THREE.Color('#ffffff'), []);

  useFrame(({ camera }, delta) => {
    const store = useGameStore.getState();
    const lighting = getLightingState(store.worldTime?.timeOfDay ?? 0.5);
    const cam = camera.position;

    // Dome and stars stay centered on the camera
    if (domeRef.current?.position) domeRef.current.position.copy(cam);
    if (starsRef.current?.position) {
      starsRef.current.position.copy(cam);
      starsRef.current.rotation.y = (store.worldTime?.timeOfDay ?? 0) * Math.PI * 2 * 0.25; // slow wheel
    }

    const u = skyMaterial.uniforms;
    u.uZenith.value.set(lighting.skyColor);
    u.uHorizon.value.set(lighting.horizonColor);
    u.uSunColor.value.set(lighting.sunColor);
    const sp = lighting.sunPosition;
    u.uSunDir.value.set(sp.x, sp.y, sp.z);
    u.uSunGlow.value = Math.max(0, Math.min(1, sp.y / 15 + 0.3)) * (0.4 + lighting.daylightFactor * 0.6);

    starMaterial.opacity = Math.max(0, 1 - lighting.daylightFactor * 1.6) * 0.9;

    // Clouds drift with the wind and wrap around the camera
    if (store.gameState !== 'paused') {
      windOffset.current[0] += WIND[0] * delta;
      windOffset.current[1] += WIND[2] * delta;
    }
    if (cloudsRef.current?.setMatrixAt) {
      let i = 0;
      const half = CLOUD_FIELD / 2;
      for (const cloud of clouds) {
        const cx = wrap(cloud.x + windOffset.current[0], cam.x, half);
        const cz = wrap(cloud.z + windOffset.current[1], cam.z, half);
        for (const [ox, oy, oz, sx, sy, sz] of cloud.parts) {
          _matrix.makeScale(sx, sy, sz).setPosition(cx + ox, CLOUD_HEIGHT + oy, cz + oz);
          cloudsRef.current.setMatrixAt(i++, _matrix);
        }
      }
      cloudsRef.current.instanceMatrix.needsUpdate = true;
      // White by day, tinted by the horizon at dawn/dusk, dim at night
      _cloudColor.set(lighting.horizonColor).lerp(_white, lighting.daylightFactor * 0.75);
      _cloudColor.multiplyScalar(0.35 + lighting.daylightFactor * 0.65);
      cloudMaterial.color.copy(_cloudColor);
    }
  });

  return (
    <group>
      <mesh ref={domeRef} geometry={domeGeometry} material={skyMaterial} renderOrder={-1000} frustumCulled={false} />
      <points ref={starsRef} geometry={starGeometry} material={starMaterial} renderOrder={-999} frustumCulled={false} />
      <instancedMesh
        ref={cloudsRef}
        args={[cloudGeometry, cloudMaterial, blobCount]}
        frustumCulled={false}
        renderOrder={-998}
      />
    </group>
  );
};

export default SkyDome;
