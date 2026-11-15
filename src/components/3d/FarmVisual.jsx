/**
 * FarmVisual — Tilled soil, growing sprouts and ripe crops on farm zones.
 *
 * Three instanced meshes, refreshed about once a second from the store inside
 * useFrame (growth depends on world time, which changes every frame; a React
 * subscription would re-render constantly).
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { getTileStage, getTileGrowth, TileStage } from '../../modules/settlement/farming';
import { FARM_MAX_TILES, ZONE_MAX_COUNT } from '../../data/tuning';

const MAX_TILES = FARM_MAX_TILES * ZONE_MAX_COUNT;
const REFRESH_SECONDS = 1;

const soilGeo = new THREE.BoxGeometry(1.7, 0.12, 1.7);
const sproutGeo = new THREE.BoxGeometry(0.35, 1, 0.35); // scaled by growth
const cropGeo = new THREE.BoxGeometry(0.7, 1.1, 0.7);
const soilMat = new THREE.MeshLambertMaterial({ color: '#5a3b1e' });
const sproutMat = new THREE.MeshLambertMaterial({ color: '#4caf50' });
const cropMat = new THREE.MeshLambertMaterial({ color: '#ff9800' });

const _m = new THREE.Matrix4();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const _quat = new THREE.Quaternion();

export default function FarmVisual() {
  const soilRef = useRef();
  const sproutRef = useRef();
  const cropRef = useRef();
  const accum = useRef(REFRESH_SECONDS); // refresh on the first frame

  const meshes = useMemo(() => [
    new THREE.InstancedMesh(soilGeo, soilMat, MAX_TILES),
    new THREE.InstancedMesh(sproutGeo, sproutMat, MAX_TILES),
    new THREE.InstancedMesh(cropGeo, cropMat, MAX_TILES),
  ], []);

  useEffect(() => {
    [soilRef.current, sproutRef.current, cropRef.current] = meshes;
    for (const mesh of meshes) {
      mesh.count = 0;
      mesh.frustumCulled = false; // instances span many zones; bounds aren't recomputed
    }
    return () => meshes.forEach((mesh) => mesh.dispose());
  }, [meshes]);

  useFrame((_, delta) => {
    accum.current += delta;
    if (accum.current < REFRESH_SECONDS) return;
    accum.current = 0;
    const soil = soilRef.current;
    const sprout = sproutRef.current;
    const crop = cropRef.current;
    if (!soil || !sprout || !crop) return;

    const { zones, worldTime } = useGameStore.getState();
    const elapsed = worldTime.elapsed;
    let nSoil = 0;
    let nSprout = 0;
    let nCrop = 0;

    for (const zone of zones) {
      if (zone.type !== 'FARMING' || !zone.farmTiles) continue;
      for (const tile of zone.farmTiles) {
        if (nSoil >= MAX_TILES) break;
        _m.compose(_pos.set(tile.x, tile.y + 0.06, tile.z), _quat, _scale.set(1, 1, 1));
        soil.setMatrixAt(nSoil++, _m);

        const stage = getTileStage(tile, elapsed);
        if (stage === TileStage.GROWING) {
          const h = 0.15 + 0.75 * getTileGrowth(tile, elapsed);
          _m.compose(_pos.set(tile.x, tile.y + 0.12 + h / 2, tile.z), _quat, _scale.set(1, h, 1));
          sprout.setMatrixAt(nSprout++, _m);
        } else if (stage === TileStage.READY) {
          _m.compose(_pos.set(tile.x, tile.y + 0.12 + 0.55, tile.z), _quat, _scale.set(1, 1, 1));
          crop.setMatrixAt(nCrop++, _m);
        }
      }
    }

    soil.count = nSoil;
    sprout.count = nSprout;
    crop.count = nCrop;
    soil.instanceMatrix.needsUpdate = true;
    sprout.instanceMatrix.needsUpdate = true;
    crop.instanceMatrix.needsUpdate = true;
  });

  return (
    <group>
      {meshes.map((mesh, i) => <primitive key={i} object={mesh} />)}
    </group>
  );
}
