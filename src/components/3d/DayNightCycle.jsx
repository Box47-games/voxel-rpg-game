/**
 * DayNightCycle.jsx — R3F component that drives day/night lighting
 *
 * Owns a TimeManager instance, updates it each frame, and syncs
 * lighting params (hemisphere sky/ground light, sun, sky dome, fog) to the
 * Three.js scene.
 * Pushes time state to the Zustand store so other systems can read it.
 */

import { useRef, useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { TimeManager } from '../../systems/time/TimeManager';
import { getLightingState } from '../../systems/lighting/DayNightLighting';
import SkyDome from './SkyDome';

// The hemisphere light's sky color leans this far toward the horizon tint
const SKY_LIGHT_TINT = 0.3;

const DayNightCycle = () => {
  const { scene, camera } = useThree();

  const ambientRef = useRef();
  const directionalRef = useRef();
  const celestialRef = useRef();

  // Read store selectors
  const timeScale = useGameStore((s) => s.worldTime.timeScale);
  const timePaused = useGameStore((s) => s.worldTime.paused);
  const savedElapsed = useGameStore((s) => s.worldTime.elapsed);

  // Actions
  const updateWorldTime = useGameStore((s) => s.updateWorldTime);

  // Create TimeManager once, restore from store
  const timeManager = useMemo(() => {
    const tm = new TimeManager(savedElapsed);
    return tm;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only create once on mount

  // Sync elapsed time from store → TimeManager (needed after save/load)
  useEffect(() => {
    // Only re-sync if the store value differs significantly from the TimeManager's
    // (avoids fighting our own per-frame writes back to the store)
    if (Math.abs(timeManager.worldTime - savedElapsed) > 1) {
      timeManager.worldTime = savedElapsed;
    }
  }, [timeManager, savedElapsed]);

  // Sync debug controls from store → TimeManager
  useEffect(() => {
    timeManager.timeScale = timeScale;
  }, [timeManager, timeScale]);

  useEffect(() => {
    timeManager.paused = timePaused;
  }, [timeManager, timePaused]);

  // Color objects reused each frame (avoid allocations)
  const skyColor = useMemo(() => new THREE.Color(), []);
  const fogColor = useMemo(() => new THREE.Color(), []);
  const ambientColor = useMemo(() => new THREE.Color(), []);
  const horizonTint = useMemo(() => new THREE.Color(), []);
  const celestialColor = useMemo(() => new THREE.Color(), []);

  // Initialize lighting immediately on mount (before first frame)
  useEffect(() => {
    const lighting = getLightingState(timeManager.timeOfDay);

    // Background shows only where the sky dome doesn't (it matches the horizon)
    skyColor.set(lighting.horizonColor);
    scene.background = skyColor;

    // Create fog if it doesn't exist, or update existing fog
    if (!scene.fog) {
      scene.fog = new THREE.Fog(lighting.fogColor, 150, 400);
    } else {
      fogColor.set(lighting.fogColor);
      scene.fog.color.copy(fogColor);
    }
  }, [scene, timeManager, skyColor, fogColor]);

  useFrame((_, delta) => {
    // Advance time
    timeManager.update(delta);

    // Get lighting state for current time
    const lighting = getLightingState(timeManager.timeOfDay);

    // Sky/ground light: from above tinted by the sky, from below by the ground
    if (ambientRef.current) {
      ambientRef.current.intensity = lighting.ambientIntensity;
      ambientColor.set(lighting.ambientColor);
      horizonTint.set(lighting.horizonColor);
      ambientRef.current.color.copy(ambientColor).lerp(horizonTint, SKY_LIGHT_TINT);
      ambientRef.current.groundColor.set(lighting.groundColor);
    }

    // Update directional light (sun by day, moon by night)
    if (directionalRef.current) {
      directionalRef.current.intensity = lighting.directionalIntensity;
      directionalRef.current.color.set(lighting.sunColor);
      directionalRef.current.position.set(
        lighting.sunPosition.x,
        lighting.sunPosition.y,
        lighting.sunPosition.z
      );
    }

    // Background behind the sky dome matches its horizon
    skyColor.set(lighting.horizonColor);
    scene.background = skyColor;

    // Update fog
    if (scene.fog) {
      fogColor.set(lighting.fogColor);
      scene.fog.color.copy(fogColor);
    }

    // Update celestial body (sun/moon) — follows player at a fixed visual distance
    if (celestialRef.current) {
      const sunPos = lighting.sunPosition;
      const isDay = sunPos.y > 0;
      // Position relative to camera so it's always visible in the sky
      const camPos = camera.position;
      // Scale down sun position to place it in the distance
      const celestialDist = 200;
      const nx = sunPos.x / 50; // Normalize (original range is ±50)
      const ny = sunPos.y / 50;
      const nz = sunPos.z / 50;
      celestialRef.current.position.set(
        camPos.x + nx * celestialDist,
        Math.max(5, camPos.y + ny * celestialDist),
        camPos.z + nz * celestialDist
      );
      // A square sun (warm white) or moon (pale blue), always facing the camera
      if (isDay) {
        celestialColor.set('#fff4c8');
        celestialRef.current.scale.setScalar(14);
      } else {
        celestialColor.set('#d6e0f5');
        celestialRef.current.scale.setScalar(9);
      }
      celestialRef.current.material.color.copy(celestialColor);
      celestialRef.current.lookAt(camPos);
      celestialRef.current.visible = true;
    }

    // Push time state to store (throttled — every ~100ms via frame rate)
    // We do this every frame since it's cheap and avoids stale reads
    updateWorldTime({
      elapsed: timeManager.worldTime,
      timeOfDay: timeManager.timeOfDay,
      dayNumber: timeManager.dayNumber,
      isNight: timeManager.isNight,
      period: timeManager.period,
      hour: timeManager.hour,
      minute: timeManager.minute,
    });
  });

  // Compute initial lighting from current time so the very first frame is correct
  const initialLighting = useMemo(() => getLightingState(timeManager.timeOfDay), []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <hemisphereLight
        ref={ambientRef}
        intensity={initialLighting.ambientIntensity}
        color={initialLighting.ambientColor}
        groundColor={initialLighting.groundColor}
      />
      <directionalLight
        ref={directionalRef}
        position={[
          initialLighting.sunPosition.x,
          initialLighting.sunPosition.y,
          initialLighting.sunPosition.z,
        ]}
        intensity={initialLighting.directionalIntensity}
        color={initialLighting.sunColor}
      />
      <SkyDome />
      {/* Sun/Moon celestial body */}
      <mesh ref={celestialRef} visible={true} renderOrder={-997}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#fff4c8" fog={false} depthWrite={false} />
      </mesh>
    </>
  );
};

export default DayNightCycle;
