/**
 * StockpileVisual — open wooden crates on stockpile zones, filled with what
 * is stored: each crate shows one material at a level for how much of it
 * there is. One merged, vertex-coloured mesh per zone (one draw call).
 */

import React, { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { VOXEL_SIZE, CHUNK_SIZE_Y, worldToChunk } from '../../systems/chunks/coordinates';
import { isSolid } from '../../systems/chunks/blockTypes';
import { materialColor } from './pickups/pickupModels';

const CRATE = 0.72; // crate footprint (world units)
const GAP = 0.22;
const WALL = 0.08;
const WALL_H = 0.46;
const MAX_CRATES = 40;
const MIN_PER_CRATE = 5;

const WOOD = '#a8743f';
const WOOD_DARK = '#7a5230';
const WOOD_LIGHT = '#c99358';

const crateMaterial = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9 });
const TEMPLATE = new THREE.BoxGeometry(1, 1, 1);

function getTerrainY(chunkManager, wx, wz) {
  if (!chunkManager) return 2;
  const { chunkX, chunkZ } = worldToChunk(wx, wz);
  const chunk = chunkManager.getChunk(chunkX, chunkZ);
  if (!chunk) return 2;
  for (let vy = CHUNK_SIZE_Y - 1; vy >= 0; vy--) {
    const worldY = vy * VOXEL_SIZE + VOXEL_SIZE / 2;
    const block = chunkManager.getBlock(wx, worldY, wz);
    if (isSolid(block)) {
      return (vy + 1) * VOXEL_SIZE;
    }
  }
  return 2;
}

/**
 * Which crates to show: [{ material, fill }] with fill 0-1, at most `slots`.
 * Every stored material gets at least one crate; each crate holds `perCrate`.
 */
export function planCrates(items, slots) {
  const entries = Object.entries(items || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length || slots <= 0) return [];
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  const perCrate = Math.max(MIN_PER_CRATE, Math.ceil(total / Math.max(1, slots - entries.length)));
  const crates = [];
  for (const [material, qty] of entries) {
    const n = Math.max(1, Math.ceil(qty / perCrate));
    for (let i = 0; i < n; i++) {
      crates.push({ material, fill: Math.min(1, (qty - i * perCrate) / perCrate) });
    }
  }
  // Too many: keep at least one crate of every material, then the fullest
  if (crates.length > slots) {
    const firsts = crates.filter((c, i) => i === 0 || crates[i - 1].material !== c.material);
    const rest = crates.filter((c) => !firsts.includes(c)).sort((a, b) => b.fill - a.fill);
    return [...firsts, ...rest].slice(0, slots);
  }
  return crates;
}

/** Boxes ([size, center, colour]) for one crate at the origin. */
export function crateBoxes(material, fill) {
  const h = CRATE / 2;
  const boxes = [
    [[CRATE, WALL, CRATE], [0, WALL / 2, 0], WOOD_DARK], // floor
    [[CRATE, WALL_H, WALL], [0, WALL_H / 2, h - WALL / 2], WOOD],
    [[CRATE, WALL_H, WALL], [0, WALL_H / 2, -h + WALL / 2], WOOD],
    [[WALL, WALL_H, CRATE - WALL * 2], [h - WALL / 2, WALL_H / 2, 0], WOOD],
    [[WALL, WALL_H, CRATE - WALL * 2], [-h + WALL / 2, WALL_H / 2, 0], WOOD],
    [[CRATE + 0.02, 0.06, 0.1], [0, WALL_H * 0.55, h - WALL / 2], WOOD_LIGHT], // slats
    [[CRATE + 0.02, 0.06, 0.1], [0, WALL_H * 0.55, -h + WALL / 2], WOOD_LIGHT],
  ];
  for (const [x, z] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    boxes.push([[0.1, WALL_H + 0.04, 0.1], [x * (h - 0.05), (WALL_H + 0.04) / 2, z * (h - 0.05)], WOOD_DARK]);
  }
  // Contents: a heap that rises with the fill, a lighter lump on top
  const inner = CRATE - WALL * 2 - 0.02;
  const level = 0.08 + (WALL_H + 0.06) * Math.max(0.12, fill);
  const color = materialColor(material);
  const top = `#${new THREE.Color(color).lerp(new THREE.Color('#ffffff'), 0.25).getHexString()}`;
  boxes.push([[inner, level - WALL, inner], [0, WALL + (level - WALL) / 2, 0], color]);
  boxes.push([[inner * 0.4, 0.08, inner * 0.4], [inner * 0.12, level + 0.04, -inner * 0.1], top]);
  return boxes;
}

/** Merge coloured boxes into one BufferGeometry (position, normal, color). */
export function mergeColoredBoxes(boxes) {
  const vpb = TEMPLATE.attributes.position.count;
  const ipb = TEMPLATE.index.count;
  const pos = new Float32Array(boxes.length * vpb * 3);
  const nor = new Float32Array(boxes.length * vpb * 3);
  const col = new Float32Array(boxes.length * vpb * 3);
  const idx = new Uint32Array(boxes.length * ipb);
  const tp = TEMPLATE.attributes.position.array;
  const tn = TEMPLATE.attributes.normal.array;
  const ti = TEMPLATE.index.array;
  const c = new THREE.Color();
  boxes.forEach(([size, center, color], b) => {
    c.set(color);
    for (let v = 0; v < vpb; v++) {
      const o = (b * vpb + v) * 3;
      for (let k = 0; k < 3; k++) {
        pos[o + k] = tp[v * 3 + k] * size[k] + center[k];
        nor[o + k] = tn[v * 3 + k];
      }
      col[o] = c.r; col[o + 1] = c.g; col[o + 2] = c.b;
    }
    for (let i = 0; i < ipb; i++) idx[b * ipb + i] = ti[i] + b * vpb;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  g.computeBoundingSphere();
  return g;
}

function StockpileZoneVisual({ zone, chunkManager }) {
  const { bounds, storage } = zone;
  const storageItems = storage?.items;

  // Stable key from the stored items, for memoisation
  const itemsKey = useMemo(() => {
    if (!storageItems) return '[]';
    const entries = Object.entries(storageItems).filter(([, v]) => v > 0).sort();
    return JSON.stringify(entries);
  }, [storageItems]);

  const geometry = useMemo(() => {
    const { minX, minZ, maxX, maxZ } = bounds;
    const zoneW = maxX - minX;
    const zoneD = maxZ - minZ;
    const cols = Math.max(1, Math.floor(zoneW / (CRATE + GAP)));
    const rows = Math.max(1, Math.floor(zoneD / (CRATE + GAP)));
    const crates = planCrates(JSON.parse(itemsKey).reduce((o, [k, v]) => ({ ...o, [k]: v }), {}), Math.min(cols * rows, MAX_CRATES));
    if (!crates.length) return null;

    const stepX = zoneW / cols;
    const stepZ = zoneD / rows;
    const boxes = [];
    crates.forEach(({ material, fill }, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols) % rows;
      const wx = minX + stepX * (col + 0.5);
      const wz = minZ + stepZ * (row + 0.5);
      const y = getTerrainY(chunkManager, wx, wz);
      for (const [size, [cx, cy, cz], color] of crateBoxes(material, fill)) {
        boxes.push([size, [wx + cx, y + cy, wz + cz], color]);
      }
    });
    return mergeColoredBoxes(boxes);
  }, [itemsKey, bounds, chunkManager]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;
  return <mesh geometry={geometry} material={crateMaterial} castShadow receiveShadow />;
}

export default function StockpileVisual({ chunkManager }) {
  const zones = useGameStore((s) => s.zones);

  const stockpileZones = useMemo(() =>
    zones.filter(z => z.type === 'STOCKPILE' && z.storage),
    [zones]
  );

  if (stockpileZones.length === 0 || !chunkManager) return null;

  return (
    <>
      {stockpileZones.map(zone => (
        <StockpileZoneVisual key={zone.id} zone={zone} chunkManager={chunkManager} />
      ))}
    </>
  );
}
