/**
 * BlueprintGhost — a building drawn as a blueprint: every cell still to place
 * outlined in blue lines over a faint fill, a gridded footprint on the ground,
 * and the next cell to place lit up and pulsing.
 *
 * Shared by construction sites (ConstructionVisual) and the placement preview
 * (BuildingPlacement). Positions are relative to the building's corner; put
 * it in a group at the site position. Everything is a few draw calls: one
 * merged line mesh for the cell edges, one instanced fill, one grid.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export const BLUEPRINT_COLOR = '#7cc4ff';
export const BLUEPRINT_BAD = '#ff6a5a';
export const BLUEPRINT_NEXT = '#e8f6ff';
export const BLUEPRINT_WAITING = '#f2c14e';

const unitBox = new THREE.BoxGeometry(1, 1, 1);
const tmpM = new THREE.Matrix4();
const tmpC = new THREE.Color();
const tmpLine = new THREE.Color();
const GRID_LIFT = 0.04; // above the ground, against z-fighting

// The 12 edges of a unit box, as pairs of corners (-0.5..0.5)
const CORNERS = [
  [-1, -1, -1], [1, -1, -1], [1, -1, 1], [-1, -1, 1],
  [-1, 1, -1], [1, 1, -1], [1, 1, 1], [-1, 1, 1],
];
const EDGES = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];

/**
 * Line-segment positions outlining each box. A tiny inset keeps the lines of
 * neighbouring cells from z-fighting with each other and with built blocks.
 * @param {{ center: number[], size: number[] }[]} boxes
 * @returns {Float32Array} 12 edges × 2 points × 3 floats per box
 */
export function boxEdgePositions(boxes, inset = 0.03) {
  const out = new Float32Array(boxes.length * EDGES.length * 6);
  let o = 0;
  for (const { center, size } of boxes) {
    const hx = size[0] / 2 - inset;
    const hy = size[1] / 2 - inset;
    const hz = size[2] / 2 - inset;
    for (const [a, b] of EDGES) {
      for (const c of [CORNERS[a], CORNERS[b]]) {
        out[o++] = center[0] + c[0] * hx;
        out[o++] = center[1] + c[1] * hy;
        out[o++] = center[2] + c[2] * hz;
      }
    }
  }
  return out;
}

/**
 * Line-segment positions for a grid over a width × depth footprint (in cells),
 * on the ground: the outline plus one line between every pair of cells.
 */
export function footprintGridPositions(width, depth, voxelSize) {
  const pts = [];
  const W = width * voxelSize;
  const D = depth * voxelSize;
  for (let i = 0; i <= width; i++) pts.push(i * voxelSize, GRID_LIFT, 0, i * voxelSize, GRID_LIFT, D);
  for (let k = 0; k <= depth; k++) pts.push(0, GRID_LIFT, k * voxelSize, W, GRID_LIFT, k * voxelSize);
  return new Float32Array(pts);
}

function lineGeometry(positions) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  return geo;
}

/**
 * @param {Object} props
 * @param {{ center, size, color? }[]} props.boxes - cells still to place (not the next one)
 * @param {{ center, size }|null} props.next - the next cell, highlighted
 * @param {{ width, depth }} props.size - footprint in cells
 * @param {number} props.voxelSize
 * @param {string} [props.color] - line colour (blue; red for a bad spot)
 * @param {string} [props.nextColor] - colour of the next cell
 * @param {boolean} [props.tint] - tint each cell's fill toward its block colour
 */
export default function BlueprintGhost({
  boxes, next = null, size, voxelSize, color = BLUEPRINT_COLOR, nextColor = BLUEPRINT_NEXT, tint = true,
}) {
  const nextRef = useRef();

  const mats = useMemo(() => ({
    line: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.9, depthWrite: false, toneMapped: false }),
    fill: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.12, depthWrite: false, toneMapped: false }),
    grid: new THREE.LineBasicMaterial({ transparent: true, opacity: 0.75, depthWrite: false, toneMapped: false }),
    floor: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.14, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }),
    nextFill: new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.45, depthWrite: false, toneMapped: false }),
    nextLine: new THREE.LineBasicMaterial({ toneMapped: false }),
  }), []);
  useEffect(() => () => Object.values(mats).forEach((m) => m.dispose()), [mats]);

  // Colours follow the props without rebuilding anything
  mats.line.color.set(color);
  mats.fill.color.set(tint ? '#ffffff' : color); // tinted: the colour is per cell
  mats.grid.color.set(color);
  mats.floor.color.set(color);
  mats.nextFill.color.set(nextColor);
  mats.nextLine.color.set(nextColor);

  const edges = useMemo(() => lineGeometry(boxEdgePositions(boxes)), [boxes]);
  useEffect(() => () => edges.dispose(), [edges]);
  const grid = useMemo(() => lineGeometry(footprintGridPositions(size.width, size.depth, voxelSize)), [size.width, size.depth, voxelSize]);
  useEffect(() => () => grid.dispose(), [grid]);
  const nextEdges = useMemo(() => (next ? lineGeometry(boxEdgePositions([{ center: [0, 0, 0], size: next.size }], -0.04)) : null), [next]);
  useEffect(() => () => nextEdges?.dispose(), [nextEdges]);

  const fillRef = (mesh) => {
    if (!mesh) return;
    boxes.forEach((b, i) => {
      tmpM.makeScale(b.size[0], b.size[1], b.size[2]).setPosition(b.center[0], b.center[1], b.center[2]);
      mesh.setMatrixAt(i, tmpM);
      // A hint of the material (wood, stone, iron) under the blue
      if (tint && b.color) mesh.setColorAt(i, tmpC.setRGB(...b.color).lerp(tmpLine.set(color), 0.6));
      else mesh.setColorAt(i, tmpC.setRGB(1, 1, 1));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  useFrame(({ clock }) => {
    if (!nextRef.current) return;
    const pulse = 1 + Math.sin(clock.elapsedTime * 5) * 0.05;
    nextRef.current.scale.setScalar(pulse);
    mats.nextFill.opacity = 0.35 + (Math.sin(clock.elapsedTime * 5) + 1) * 0.12;
  });

  const W = size.width * voxelSize;
  const D = size.depth * voxelSize;

  return (
    <group>
      {/* Footprint: a faint floor and a grid of the cells */}
      <mesh material={mats.floor} position={[W / 2, GRID_LIFT / 2, D / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
        <planeGeometry args={[W, D]} />
      </mesh>
      <lineSegments geometry={grid} material={mats.grid} renderOrder={2} />

      {/* Cells still to place */}
      {boxes.length > 0 && (
        <>
          <instancedMesh key={boxes.length} ref={fillRef} args={[unitBox, mats.fill, boxes.length]} frustumCulled={false} renderOrder={3} />
          <lineSegments geometry={edges} material={mats.line} frustumCulled={false} renderOrder={4} />
        </>
      )}

      {/* The next one, lit up */}
      {next && (
        <group ref={nextRef} position={next.center}>
          <mesh geometry={unitBox} material={mats.nextFill} scale={next.size} renderOrder={5} />
          <lineSegments geometry={nextEdges} material={mats.nextLine} renderOrder={6} />
        </group>
      )}
    </group>
  );
}
