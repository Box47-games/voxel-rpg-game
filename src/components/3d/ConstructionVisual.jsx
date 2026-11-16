/**
 * ConstructionVisual — Renders construction sites: a blueprint of the blocks
 * still to place (one instanced mesh; the next block pulses), wooden
 * scaffolding around the footprint, and a progress bar above it.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { getBuildingById, parseLayers } from '../../data/buildings';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import { getBlockColor } from '../../systems/chunks/blockTypes';

const boxGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false });
const nextMat = new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.5, depthWrite: false });
const scaffoldMat = new THREE.MeshLambertMaterial({ color: '#9a6a3c' });
const BLUEPRINT = new THREE.Color('#7cc4ff');
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();

/** Corner posts plus a ring of planks every two levels, around the footprint. */
function scaffoldBoxes(site, size) {
  const [x0, y0, z0] = site.position;
  const w = size.width * VOXEL_SIZE;
  const d = size.depth * VOXEL_SIZE;
  const h = size.height * VOXEL_SIZE;
  const pad = 0.35;
  const out = [];
  for (const [cx, cz] of [[x0 - pad, z0 - pad], [x0 + w + pad, z0 - pad], [x0 - pad, z0 + d + pad], [x0 + w + pad, z0 + d + pad]]) {
    out.push({ p: [cx, y0 + h / 2, cz], s: [0.3, h, 0.3] });
  }
  for (let y = VOXEL_SIZE * 2; y <= h; y += VOXEL_SIZE * 2) {
    out.push({ p: [x0 + w / 2, y0 + y, z0 - pad], s: [w + pad * 2, 0.16, 0.36] });
    out.push({ p: [x0 + w / 2, y0 + y, z0 + d + pad], s: [w + pad * 2, 0.16, 0.36] });
    out.push({ p: [x0 - pad, y0 + y, z0 + d / 2], s: [0.36, 0.16, d + pad * 2] });
    out.push({ p: [x0 + w + pad, y0 + y, z0 + d / 2], s: [0.36, 0.16, d + pad * 2] });
  }
  return out;
}

/** All the blueprint blocks as one instanced mesh (block colour, tinted blue). */
function GhostBlocks({ blocks }) {
  const ref = (mesh) => {
    if (!mesh) return;
    blocks.forEach((b, i) => {
      mesh.setMatrixAt(i, tmpM.makeTranslation(b.position[0], b.position[1], b.position[2]));
      mesh.setColorAt(i, tmpC.setRGB(...b.color).lerp(BLUEPRINT, 0.45));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  if (blocks.length === 0) return null;
  return <instancedMesh key={blocks.length} ref={ref} args={[boxGeo, ghostMat, blocks.length]} frustumCulled={false} />;
}

function Scaffold({ boxes }) {
  const ref = (mesh) => {
    if (!mesh) return;
    boxes.forEach((b, i) => {
      tmpM.makeScale(...b.s).setPosition(...b.p);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return <instancedMesh key={boxes.length} ref={ref} args={[unitBox, scaffoldMat, boxes.length]} />;
}
const barBgGeo = new THREE.PlaneGeometry(4, 0.4);
const barBorderGeo = new THREE.PlaneGeometry(4.1, 0.5);

function ConstructionSiteVisual({ site }) {
  const barGroupRef = useRef();
  const nextRef = useRef();
  const { camera } = useThree();

  const building = useMemo(() => getBuildingById(site.buildingId), [site.buildingId]);
  const blocks = useMemo(() => building ? parseLayers(building) : [], [building]);

  // Ghost blocks = blocks not yet placed (index >= blocksPlaced)
  const ghostBlocks = useMemo(() => {
    if (!building || site.status === 'COMPLETE') return [];
    return blocks.slice(site.blocksPlaced).map(b => ({
      position: [
        site.position[0] + b.x * VOXEL_SIZE + VOXEL_SIZE / 2,
        site.position[1] + b.y * VOXEL_SIZE + VOXEL_SIZE / 2,
        site.position[2] + b.z * VOXEL_SIZE + VOXEL_SIZE / 2,
      ],
      color: getBlockColor(b.blockType),
    }));
  }, [building, blocks, site.position, site.blocksPlaced, site.status]);

  // Progress calculation
  const progress = useMemo(() => {
    if (site.status === 'PLACED') {
      let totalReq = 0, totalDel = 0;
      for (const [mat, req] of Object.entries(site.materialsRequired)) {
        totalReq += req;
        totalDel += Math.min(site.materialsDelivered[mat] || 0, req);
      }
      return totalReq > 0 ? totalDel / totalReq : 0;
    }
    if (site.status === 'BUILDING') {
      return site.totalBlocks > 0 ? site.blocksPlaced / site.totalBlocks : 0;
    }
    return 1;
  }, [site.status, site.materialsRequired, site.materialsDelivered, site.blocksPlaced, site.totalBlocks]);

  const scaffold = useMemo(
    () => (building ? scaffoldBoxes(site, building.size) : []),
    [building, site]
  );

  // Billboard the progress bar; pulse the next block to place
  useFrame(({ clock }) => {
    if (barGroupRef.current) {
      barGroupRef.current.lookAt(camera.position);
    }
    if (nextRef.current) {
      nextRef.current.scale.setScalar(1.02 + Math.sin(clock.elapsedTime * 4) * 0.04);
    }
  });

  if (!building || site.status === 'COMPLETE') return null;

  const barY = site.position[1] + building.size.height * VOXEL_SIZE + 1.5;
  const barX = site.position[0] + (building.size.width * VOXEL_SIZE) / 2;
  const barZ = site.position[2] + (building.size.depth * VOXEL_SIZE) / 2;

  // Same colours as the HUD: gold while materials arrive, blue while building
  const barColor = site.status === 'BUILDING' ? '#4dabf7' : '#f2c14e';
  const barWidth = 4 * Math.min(1, progress);

  return (
    <>
      {/* Blueprint of the blocks still to place; the next one pulses */}
      <GhostBlocks blocks={ghostBlocks.slice(1)} />
      {ghostBlocks[0] && site.status === 'BUILDING' && (
        <mesh ref={nextRef} geometry={boxGeo} material={nextMat} position={ghostBlocks[0].position} />
      )}
      {ghostBlocks[0] && site.status !== 'BUILDING' && <GhostBlocks blocks={ghostBlocks.slice(0, 1)} />}

      {/* Wooden scaffolding around the footprint */}
      <Scaffold boxes={scaffold} />

      {/* Progress bar */}
      <group ref={barGroupRef} position={[barX, barY, barZ]}>
        {/* Border */}
        <mesh geometry={barBorderGeo} position={[0, 0, -0.01]}>
          <meshBasicMaterial color="#0b0e15" side={THREE.DoubleSide} depthTest={false} />
        </mesh>
        {/* Background */}
        <mesh geometry={barBgGeo}>
          <meshBasicMaterial color="#171c27" transparent opacity={0.9} side={THREE.DoubleSide} depthTest={false} />
        </mesh>
        {/* Fill bar */}
        {barWidth > 0 && (
          <mesh position={[-(4 - barWidth) / 2, 0, 0.01]} scale={[barWidth, 1, 1]}>
            <planeGeometry args={[1, 0.3]} />
            <meshBasicMaterial color={barColor} side={THREE.DoubleSide} depthTest={false} />
          </mesh>
        )}
      </group>
    </>
  );
}

export default function ConstructionVisual() {
  const constructionSites = useGameStore((s) => s.constructionSites);

  const activeSites = useMemo(
    () => constructionSites.filter(s => s.status !== 'COMPLETE'),
    [constructionSites]
  );

  if (activeSites.length === 0) return null;

  return (
    <>
      {activeSites.map(site => (
        <ConstructionSiteVisual key={site.id} site={site} />
      ))}
    </>
  );
}
