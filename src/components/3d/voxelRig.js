/**
 * voxelRig.js — Build animated voxel characters from colored boxes.
 *
 * A model is a set of bones and a list of colored boxes, each attached to a
 * bone. buildRigGeometry() merges the boxes into one skinned geometry (plus a
 * second, unlit one for `glow` parts such as eyes that should shine at night),
 * and createRig() gives each character its own skeleton over that shared
 * geometry: one draw call per character (two with glowing parts).
 *
 * Model format (model space, before `unit` scaling):
 *  - Characters face +Z, Y is up, feet stand on Y = 0, the left side is +X.
 *  - `bones`: { name: { pivot: [x, y, z], parent?: name } }; parentless bones
 *    hang off the mesh.
 *  - `parts`: [bone, colorKey, [sx, sy, sz], [cx, cy, cz], opts?] with the box
 *    centered at c. opts.variant: only on that variant. opts.glow: unlit.
 *  - `colors`: { colorKey: '#rrggbb' }, `unit`: world units per model unit.
 * pair()/sym() mirror parts across X (pair onto the matching L/R bone).
 */

import * as THREE from 'three';

// ── Authoring helpers ────────────────────────────────────────

/** Left part on `<bone>L` plus its mirror on `<bone>R`. */
export function pair(bone, color, size, [x, y, z], opts) {
  return [
    [`${bone}L`, color, size, [x, y, z], opts],
    [`${bone}R`, color, size, [-x, y, z], opts],
  ];
}

/** A part and its mirror image on the same bone. */
export function sym(bone, color, size, [x, y, z], opts) {
  return [
    [bone, color, size, [x, y, z], opts],
    [bone, color, size, [-x, y, z], opts],
  ];
}

/** Small deterministic hash → [0, 1). */
export function hash01(a, b) {
  let h = (a * 374761393 + b * 668265263) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Hash a string id to an unsigned int. */
export function hashString(id) {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  return h;
}

// ── Model queries ────────────────────────────────────────────

/** The parts of a model that appear on `variant`. */
export function getModelParts(model, variant = null) {
  return model.parts.filter(([, , , , opts]) => !opts?.variant || opts.variant === variant);
}

/**
 * World-space bounds of a model (min/max over its boxes, optionally only the
 * bones `bonesFilter` accepts).
 * @returns {{ min: number[], max: number[], size: number[] }}
 */
export function getModelBounds(model, variant = null, bonesFilter = null) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const [bone, , size, center] of getModelParts(model, variant)) {
    if (bonesFilter && !bonesFilter(bone)) continue;
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], (center[i] - size[i] / 2) * model.unit);
      max[i] = Math.max(max[i], (center[i] + size[i] / 2) * model.unit);
    }
  }
  return { min, max, size: [max[0] - min[0], max[1] - min[1], max[2] - min[2]] };
}

/** Half extents and center of a physics box around the bones `bonesFilter` accepts. */
export function getColliderBox(model, bonesFilter = null) {
  const { min, max } = getModelBounds(model, null, bonesFilter);
  return {
    halfExtents: [(max[0] - min[0]) / 2, (max[1] - min[1]) / 2, (max[2] - min[2]) / 2],
    center: [(max[0] + min[0]) / 2, (max[1] + min[1]) / 2, (max[2] + min[2]) / 2],
  };
}

// ── Geometry ─────────────────────────────────────────────────

const FACE_SHADE = { top: 1.06, side: 0.94, bottom: 0.72 };
const VERTS_PER_BOX = 24;
const INDICES_PER_BOX = 36;

function mergeBoxes(model, parts, boneNames, shade) {
  const positions = new Float32Array(parts.length * VERTS_PER_BOX * 3);
  const normals = new Float32Array(parts.length * VERTS_PER_BOX * 3);
  const colors = new Float32Array(parts.length * VERTS_PER_BOX * 3);
  const skinIndex = new Uint16Array(parts.length * VERTS_PER_BOX * 4);
  const skinWeight = new Float32Array(parts.length * VERTS_PER_BOX * 4);
  const indices = new Uint16Array(parts.length * INDICES_PER_BOX);
  const color = new THREE.Color();

  parts.forEach(([bone, colorKey, size, center], p) => {
    const boneIndex = boneNames.indexOf(bone);
    if (boneIndex < 0) throw new Error(`Unknown bone "${bone}"`);
    const hex = model.colors[colorKey];
    if (!hex) throw new Error(`Unknown color "${colorKey}"`);

    const box = new THREE.BoxGeometry(size[0] * model.unit, size[1] * model.unit, size[2] * model.unit);
    box.translate(center[0] * model.unit, center[1] * model.unit, center[2] * model.unit);
    const pos = box.attributes.position.array;
    const nor = box.attributes.normal.array;
    const base = p * VERTS_PER_BOX;
    positions.set(pos, base * 3);
    normals.set(nor, base * 3);

    // A little per-box jitter and darker undersides give the voxels depth
    const jitter = shade ? 0.95 + hash01(p, boneIndex) * 0.1 : 1;
    color.set(hex);
    for (let v = 0; v < VERTS_PER_BOX; v++) {
      const ny = nor[v * 3 + 1];
      const face = !shade ? 1 : ny > 0.5 ? FACE_SHADE.top : ny < -0.5 ? FACE_SHADE.bottom : FACE_SHADE.side;
      const o = (base + v) * 3;
      colors[o] = Math.min(1, color.r * face * jitter);
      colors[o + 1] = Math.min(1, color.g * face * jitter);
      colors[o + 2] = Math.min(1, color.b * face * jitter);
      skinIndex[(base + v) * 4] = boneIndex;
      skinWeight[(base + v) * 4] = 1;
    }
    const idx = box.index.array;
    for (let i = 0; i < idx.length; i++) indices[p * INDICES_PER_BOX + i] = idx[i] + base;
    box.dispose();
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndex, 4));
  geometry.setAttribute('skinWeight', new THREE.BufferAttribute(skinWeight, 4));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

/**
 * Merge a model's boxes into skinned geometry.
 * @returns {{ geometry: THREE.BufferGeometry, glowGeometry: THREE.BufferGeometry|null }}
 */
export function buildRigGeometry(model, { variant = null, boneNames = Object.keys(model.bones) } = {}) {
  const parts = getModelParts(model, variant);
  const lit = parts.filter(([, , , , opts]) => !opts?.glow);
  const glow = parts.filter(([, , , , opts]) => opts?.glow);
  return {
    geometry: mergeBoxes(model, lit, boneNames, true),
    glowGeometry: glow.length ? mergeBoxes(model, glow, boneNames, false) : null,
  };
}

/**
 * Cache rig geometry by key, so every character of a kind shares it.
 * @returns {(key: string, build: () => object) => object}
 */
export function createGeometryCache() {
  const cache = new Map();
  return (key, build) => {
    if (!cache.has(key)) cache.set(key, build());
    return cache.get(key);
  };
}

// ── Instances ────────────────────────────────────────────────

/**
 * A posable character: a SkinnedMesh with its own skeleton over shared
 * geometry. Bones in `boneNames` the model doesn't define sit at the origin
 * with nothing skinned to them.
 * @returns {{ mesh, glowMesh, material, bones, rest, dispose }}
 */
export function createRig(model, { geometry, glowGeometry }, {
  boneNames = Object.keys(model.bones),
  tint = 1,
  roughness = 0.92,
} = {}) {
  const bones = {};
  const rest = {};
  for (const name of boneNames) {
    const bone = new THREE.Bone();
    bone.name = name;
    bones[name] = bone;
  }
  const roots = [];
  for (const name of boneNames) {
    const def = model.bones[name];
    const bone = bones[name];
    const pivot = def ? def.pivot : [0, 0, 0];
    const parentPivot = def?.parent ? model.bones[def.parent].pivot : [0, 0, 0];
    bone.position.set(
      (pivot[0] - parentPivot[0]) * model.unit,
      (pivot[1] - parentPivot[1]) * model.unit,
      (pivot[2] - parentPivot[2]) * model.unit,
    );
    rest[name] = bone.position.clone();
    if (def?.parent) bones[def.parent].add(bone);
    else roots.push(bone);
  }

  const material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness, metalness: 0 });
  material.color.setScalar(tint);
  const mesh = new THREE.SkinnedMesh(geometry, material);
  for (const bone of roots) mesh.add(bone);
  mesh.castShadow = true;
  mesh.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(boneNames.map((n) => bones[n]));
  mesh.bind(skeleton);

  // Unlit parts (glowing eyes) share the skeleton through a second mesh
  let glowMesh = null;
  let glowMaterial = null;
  if (glowGeometry) {
    glowMaterial = new THREE.MeshBasicMaterial({ vertexColors: true });
    glowMesh = new THREE.SkinnedMesh(glowGeometry, glowMaterial);
    glowMesh.raycast = () => {}; // hits go to the body mesh
    mesh.add(glowMesh);
    mesh.updateMatrixWorld(true);
    glowMesh.bind(skeleton, mesh.bindMatrix);
  }

  return {
    mesh,
    glowMesh,
    material,
    glowMaterial,
    bones,
    rest,
    dispose() {
      material.dispose();
      glowMaterial?.dispose();
      skeleton.dispose();
    },
  };
}

/**
 * Apply a pose ({ bones: { name: { rx, ry, rz, lift, sx, sy, sz } } }) to a
 * rig. Every bone not in the pose returns to its rest transform.
 */
export function applyBonePose(rig, pose) {
  for (const name in rig.bones) {
    const bone = rig.bones[name];
    const p = pose.bones[name];
    const rest = rig.rest[name];
    if (!p) {
      bone.position.copy(rest);
      bone.rotation.set(0, 0, 0);
      bone.scale.set(1, 1, 1);
      continue;
    }
    bone.position.set(rest.x, rest.y + (p.lift || 0), rest.z);
    bone.rotation.set(p.rx || 0, p.ry || 0, p.rz || 0);
    bone.scale.set(p.sx ?? 1, p.sy ?? 1, p.sz ?? 1);
  }
}
