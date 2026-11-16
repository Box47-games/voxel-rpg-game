/**
 * BuildingPlacement — Ghost preview + click-to-place for construction sites.
 *
 * Active when placingBuildingId !== null. Raycasts from the cursor (or the
 * screen centre in first person) to find the terrain surface, renders a
 * translucent preview, validates placement, and commits on click.
 * Touch: tap to move the preview there, tap the same spot again to place.
 * Right-click (without dragging the camera) cancels.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { getBuildingById, parseLayers } from '../../data/buildings';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import { isSolid } from '../../systems/chunks/blockTypes';
import { getBlockColor } from '../../systems/chunks/blockTypes';

const boxGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const MAX_RAY_DISTANCE = 160;
const DRAG_PX = 8; // more movement than this is a camera drag, not a click
const RETAP_PX = 40; // touch: a second tap this close to the first confirms

export default function BuildingPlacement({ chunkManager }) {
  const { camera, gl } = useThree();
  const placingBuildingId = useGameStore((s) => s.placingBuildingId);
  const placeConstructionSite = useGameStore((s) => s.placeConstructionSite);
  const cancelPlacingBuilding = useGameStore((s) => s.cancelPlacingBuilding);

  const previewRef = useRef(null);
  const positionRef = useRef([0, 0, 0]);
  const validRef = useRef(false);
  const rayDir = useRef(new THREE.Vector3());
  const raycaster = useRef(new THREE.Raycaster());
  // Screen point the preview follows (NDC); null = screen centre
  const pointerNdc = useRef(null);
  const lastTap = useRef(null);

  const building = useMemo(() => placingBuildingId ? getBuildingById(placingBuildingId) : null, [placingBuildingId]);
  const blocks = useMemo(() => building ? parseLayers(building) : [], [building]);

  // Create instanced mesh data for the ghost blocks
  const blockData = useMemo(() => {
    if (!building || blocks.length === 0) return null;
    return blocks.map(b => ({
      offset: [b.x * VOXEL_SIZE, b.y * VOXEL_SIZE, b.z * VOXEL_SIZE],
      color: getBlockColor(b.blockType),
    }));
  }, [building, blocks]);

  // Raycast from camera center to find terrain placement position
  useFrame(() => {
    if (!building || !chunkManager || !previewRef.current) return;

    let origin = camera.position;
    let dir = rayDir.current;
    if (pointerNdc.current && !document.pointerLockElement) {
      raycaster.current.setFromCamera(pointerNdc.current, camera);
      origin = raycaster.current.ray.origin;
      dir = raycaster.current.ray.direction;
    } else {
      camera.getWorldDirection(dir);
    }

    // Step along ray to find first solid block (long enough for the raised plan camera)
    let foundPos = null;
    for (let dist = 0; dist < MAX_RAY_DISTANCE; dist += 0.5) {
      const cx = origin.x + dir.x * dist;
      const cy = origin.y + dir.y * dist;
      const cz = origin.z + dir.z * dist;

      const block = chunkManager.getBlock(cx, cy, cz);
      if (isSolid(block)) {
        // Snap to voxel grid — place building on top surface
        const vx = Math.floor(cx / VOXEL_SIZE) * VOXEL_SIZE;
        const vy = Math.floor(cy / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE; // Top of this block
        const vz = Math.floor(cz / VOXEL_SIZE) * VOXEL_SIZE;
        foundPos = [vx, vy, vz];
        break;
      }
    }

    if (!foundPos) {
      previewRef.current.visible = false;
      validRef.current = false;
      return;
    }

    const [px, py, pz] = foundPos;
    positionRef.current = foundPos;
    previewRef.current.visible = true;
    previewRef.current.position.set(px, py, pz);

    // Validate placement
    let valid = true;

    // Check player range (20 world units)
    const playerPos = useGameStore.getState().player.position;
    const dpx = playerPos[0] - px, dpz = playerPos[2] - pz;
    if (Math.sqrt(dpx * dpx + dpz * dpz) > 40) {
      valid = false;
    }

    // Check ground support: all bottom-layer blocks need solid terrain below
    if (valid) {
      for (const b of blocks) {
        if (b.y !== 0) continue; // Only check bottom layer
        const wx = px + b.x * VOXEL_SIZE + VOXEL_SIZE / 2;
        const wy = py - VOXEL_SIZE / 2; // Block below the foundation
        const wz = pz + b.z * VOXEL_SIZE + VOXEL_SIZE / 2;
        if (!isSolid(chunkManager.getBlock(wx, wy, wz))) {
          valid = false;
          break;
        }
      }
    }

    // Check overlap with existing construction sites
    if (valid) {
      const sites = useGameStore.getState().constructionSites;
      for (const site of sites) {
        const sb = getBuildingById(site.buildingId);
        if (!sb) continue;
        const [sx, sy, sz] = site.position;
        // Simple AABB overlap check
        const overlapX = px < sx + sb.size.width * VOXEL_SIZE && px + building.size.width * VOXEL_SIZE > sx;
        const overlapY = py < sy + sb.size.height * VOXEL_SIZE && py + building.size.height * VOXEL_SIZE > sy;
        const overlapZ = pz < sz + sb.size.depth * VOXEL_SIZE && pz + building.size.depth * VOXEL_SIZE > sz;
        if (overlapX && overlapY && overlapZ) {
          valid = false;
          break;
        }
      }
    }

    validRef.current = valid;

    // Update ghost block colors (green = valid, red = invalid)
    const children = previewRef.current.children;
    for (let i = 0; i < children.length; i++) {
      const mesh = children[i];
      if (mesh.isMesh && mesh.material) {
        mesh.material.color.setRGB(
          valid ? 0 : 1,
          valid ? 1 : 0,
          0
        );
      }
    }
  });

  // Handle click to place + right-click/Escape to cancel
  useEffect(() => {
    if (!placingBuildingId || !chunkManager) return;

    const canvas = gl.domElement;
    const toNdc = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * 2 - 1, y: -((e.clientY - r.top) / r.height) * 2 + 1 };
    };
    const place = () => {
      if (!validRef.current || !building) return;
      placeConstructionSite(building.id, [...positionRef.current], { ...building.cost }, blocks.length);
    };
    let down = null;

    const handlePointerMove = (e) => {
      if (e.pointerType === 'mouse') pointerNdc.current = toNdc(e);
    };
    const handlePointerDown = (e) => {
      down = { x: e.clientX, y: e.clientY, button: e.button };
    };
    const handlePointerUp = (e) => {
      if (!down) return;
      const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y) > DRAG_PX;
      const button = down.button;
      down = null;
      if (moved) return; // camera drag
      if (button === 2) {
        cancelPlacingBuilding();
        return;
      }
      if (button !== 0) return;
      if (e.pointerType === 'mouse') {
        place();
        return;
      }
      // Touch / pen: first tap moves the preview, a second tap on the same spot places it
      const prev = lastTap.current;
      lastTap.current = { x: e.clientX, y: e.clientY };
      pointerNdc.current = toNdc(e);
      if (prev && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < RETAP_PX) {
        lastTap.current = null;
        place();
      }
    };
    const handleContextMenu = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        cancelPlacingBuilding();
      }
    };

    canvas.addEventListener('pointermove', handlePointerMove);
    canvas.addEventListener('pointerdown', handlePointerDown);
    canvas.addEventListener('pointerup', handlePointerUp);
    canvas.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      canvas.removeEventListener('pointermove', handlePointerMove);
      canvas.removeEventListener('pointerdown', handlePointerDown);
      canvas.removeEventListener('pointerup', handlePointerUp);
      canvas.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      lastTap.current = null;
    };
  }, [placingBuildingId, building, blocks, chunkManager, gl, placeConstructionSite, cancelPlacingBuilding]);

  if (!building || !blockData) return null;

  return (
    <group ref={previewRef} visible={false}>
      {blockData.map((b, i) => (
        <mesh
          key={i}
          geometry={boxGeo}
          position={[
            b.offset[0] + VOXEL_SIZE / 2,
            b.offset[1] + VOXEL_SIZE / 2,
            b.offset[2] + VOXEL_SIZE / 2,
          ]}
        >
          <meshBasicMaterial
            color="#00ff00"
            transparent
            opacity={0.3}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
