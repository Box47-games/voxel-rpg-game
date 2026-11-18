/**
 * ConstructionVisual — Renders construction sites: a blueprint of the blocks
 * still to place (one instanced mesh; the next block pulses), wooden
 * scaffolding around the footprint, and a progress bar above it.
 */

import React, { useRef, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import useGameStore from '../../stores/useGameStore';
import { getBuildingById, parseLayers, cellBox } from '../../data/buildings';
import { buildProgress, canPlaceNext } from '../../modules/settlement/buildingInfo';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import { getBlockColor } from '../../systems/chunks/blockTypes';
import { getScaffoldRoute, segmentBox } from '../../systems/construction/scaffoldRoute';
import { SCAFFOLD_OFFSET, SCAFFOLD_WIDTH } from '../../data/tuning';

const boxGeo = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const ghostMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.28, depthWrite: false });
const nextMat = new THREE.MeshBasicMaterial({ color: '#9fd3ff', transparent: true, opacity: 0.5, depthWrite: false });
const scaffoldMat = new THREE.MeshLambertMaterial({ color: '#9a6a3c' });
const plankMat = new THREE.MeshLambertMaterial({ color: '#b98551' });
const BLUEPRINT = new THREE.Color('#7cc4ff');
const tmpM = new THREE.Matrix4();
const ONE = [1, 1, 1];
const tmpC = new THREE.Color();

/** Posts at the ramp's outer corners, up to the site's height. */
function scaffoldPosts(site, size) {
  const [x0, y0, z0] = site.position;
  const w = size.width * VOXEL_SIZE;
  const d = size.depth * VOXEL_SIZE;
  const h = size.height * VOXEL_SIZE;
  const o = SCAFFOLD_OFFSET + SCAFFOLD_WIDTH / 2 + 0.15;
  return [[x0 - o, z0 - o], [x0 + w + o, z0 - o], [x0 - o, z0 + d + o], [x0 + w + o, z0 + d + o]]
    .map(([cx, cz]) => ({ p: [cx, y0 + h / 2, cz], s: [0.3, h, 0.3] }));
}

/** All the blueprint blocks as one instanced mesh (block colour, tinted blue). */
function GhostBlocks({ blocks }) {
  const ref = (mesh) => {
    if (!mesh) return;
    blocks.forEach((b, i) => {
      const sc = b.scale || ONE;
      mesh.setMatrixAt(i, tmpM.makeScale(sc[0], sc[1], sc[2]).setPosition(b.position[0], b.position[1], b.position[2]));
      mesh.setColorAt(i, tmpC.setRGB(...b.color).lerp(BLUEPRINT, 0.45));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  if (blocks.length === 0) return null;
  return <instancedMesh key={blocks.length} ref={ref} args={[boxGeo, ghostMat, blocks.length]} frustumCulled={false} />;
}

function Scaffold({ posts, route }) {
  const ref = (mesh) => {
    if (!mesh) return;
    posts.forEach((b, i) => {
      tmpM.makeScale(...b.s).setPosition(...b.p);
      mesh.setMatrixAt(i, tmpM);
    });
    mesh.instanceMatrix.needsUpdate = true;
  };
  return (
    <>
      <instancedMesh key={posts.length} ref={ref} args={[unitBox, scaffoldMat, posts.length]} />
      {/* The walkway: one plank run per side, spiralling up */}
      {route?.segments.map((seg, i) => {
        const box = segmentBox(route, seg);
        return (
          <mesh
            key={i}
            geometry={unitBox}
            material={plankMat}
            position={box.position}
            rotation={[box.rotation[0], box.rotation[1], box.rotation[2], 'YZX']}
            scale={box.size}
          />
        );
      })}
    </>
  );
}
const barBgGeo = new THREE.PlaneGeometry(4, 0.4);
const barBorderGeo = new THREE.PlaneGeometry(4.1, 0.5);

function ConstructionSiteVisual({ site }) {
  const barGroupRef = useRef();
  const nextRef = useRef();
  const nextScaleRef = useRef(ONE);
  const { camera } = useThree();

  const building = useMemo(() => getBuildingById(site.buildingId), [site.buildingId]);
  const blocks = useMemo(() => building ? parseLayers(building) : [], [building]);

  // Ghost blocks = blocks not yet placed (index >= blocksPlaced)
  const ghostBlocks = useMemo(() => {
    if (!building || site.status === 'COMPLETE') return [];
    return blocks.slice(site.blocksPlaced).map((b) => {
      // A piece (slab, plank floor) shows as the part of the cell it fills
      const { center, size } = cellBox(b, VOXEL_SIZE);
      return {
        position: [site.position[0] + center[0], site.position[1] + center[1], site.position[2] + center[2]],
        scale: size.map((v) => v / VOXEL_SIZE),
        color: getBlockColor(b.blockType),
      };
    });
  }, [building, blocks, site.position, site.blocksPlaced, site.status]);
  nextScaleRef.current = ghostBlocks[0]?.scale || ONE;

  // Progress: how much is built (it builds as materials arrive);
  // `paid`: the next block or piece has its materials, so it can go in now
  const progress = buildProgress(site);
  const paid = canPlaceNext(site);

  const posts = useMemo(
    () => (building ? scaffoldPosts(site, building.size) : []),
    [building, site]
  );
  const route = useMemo(() => getScaffoldRoute(site), [site]);

  // Billboard the progress bar; pulse the next block to place
  useFrame(({ clock }) => {
    if (barGroupRef.current) {
      barGroupRef.current.lookAt(camera.position);
    }
    if (nextRef.current) {
      const pulse = 1.02 + Math.sin(clock.elapsedTime * 4) * 0.04;
      const sc = nextScaleRef.current || ONE;
      nextRef.current.scale.set(sc[0] * pulse, sc[1] * pulse, sc[2] * pulse);
    }
  });

  if (!building || site.status === 'COMPLETE') return null;

  const barY = site.position[1] + building.size.height * VOXEL_SIZE + 1.5;
  const barX = site.position[0] + (building.size.width * VOXEL_SIZE) / 2;
  const barZ = site.position[2] + (building.size.depth * VOXEL_SIZE) / 2;

  // Same colours as the HUD: blue while building, gold while waiting for materials
  const barColor = paid ? '#4dabf7' : '#f2c14e';
  const barWidth = 4 * Math.min(1, progress);

  return (
    <>
      {/* Blueprint of the blocks still to place; the next one pulses */}
      <GhostBlocks blocks={ghostBlocks.slice(1)} />
      {ghostBlocks[0] && paid && (
        <mesh ref={nextRef} geometry={boxGeo} material={nextMat} position={ghostBlocks[0].position} />
      )}
      {ghostBlocks[0] && !paid && <GhostBlocks blocks={ghostBlocks.slice(0, 1)} />}

      {/* Wooden scaffolding: corner posts and a ramp spiralling up to the top */}
      <Scaffold posts={posts} route={route} />

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

/**
 * Physics for the scaffolding ramps (inside <Physics>): one fixed body per
 * site, a box collider per ramp side, so the player can walk up.
 */
export function ScaffoldColliders() {
  const constructionSites = useGameStore((s) => s.constructionSites);
  const sites = useMemo(
    () => constructionSites.filter((s) => s.status !== 'COMPLETE' && getScaffoldRoute(s)),
    [constructionSites]
  );
  return (
    <>
      {sites.map((site) => {
        const route = getScaffoldRoute(site);
        return (
          <RigidBody key={`${site.id}:${site.position.join(',')}`} type="fixed" colliders={false}>
            {route.segments.map((seg, i) => {
              const box = segmentBox(route, seg);
              const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...box.rotation, 'YZX'));
              return (
                <CuboidCollider
                  key={i}
                  args={[box.size[0] / 2, box.size[1] / 2, box.size[2] / 2]}
                  position={box.position}
                  quaternion={[q.x, q.y, q.z, q.w]}
                />
              );
            })}
          </RigidBody>
        );
      })}
    </>
  );
}
