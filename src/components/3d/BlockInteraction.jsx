/**
 * BlockInteraction - Handles block selection, mining, and placement
 *
 * Desktop (first-person): Raycasts from camera center, click to mine/place
 * Mobile: Long press (~500ms) on a block to mine/place; short tap moves (via TouchControls)
 */

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import { BlockTypes, isSolid, getBlockHardness } from '../../systems/chunks/blockTypes';
import useGameStore from '../../stores/useGameStore';
import { calculateDrops, getPlacementCost, canAffordPlacement, payPlacement, placementByVolume } from '../../data/blockDrops';
import { pieceTiers, materialName, PIECES, blocksAvailable, baseMaterial } from '../../data/pieces';
import { BLOCK_USE_ACTIONS } from '../../data/blockUseActions';
import { usableTool } from '../../systems/tools/toolDurability';
import { TOUCH_MINE_HOLD_MS, TOUCH_BLOCK_REACH, MOUSE_BLOCK_REACH, ENEMY_CLICK_ASSIST_PX, TAP_MAX_DISTANCE_PX, HARVEST_SPEED_BARE_HANDS, USE_KEY_RANGE, USE_KEY_COOLDOWN } from '../../data/tuning';
import { findInteractTarget } from '../../systems/interaction/interactTarget';
import { notePlayerAction } from '../../systems/playerActions';
import { getSpellById, executeSpell } from '../../data/spells';
import { performMeleeAttack, MELEE_COOLDOWN } from '../../data/meleeAttack';
import { audioManager } from '../../utils/AudioManager';
import { getQuestManager } from '../../systems/QuestManager';
import { isTouchDevice } from '../../utils/deviceDetection';
import { subCubeOf, subFilled } from '../../systems/chunks/cellShape';
import { targetPiece, minePiece, pieceMiningFraction, cellCenter } from '../../systems/chunks/pieceMining';
import { raycastUnits, planPiece, applyPiece, boxesOverlap } from '../../systems/chunks/piecePlacement';
import { enemyNearScreenPoint } from '../../systems/combat/enemyHits';

// Maximum reach distance for block interaction
const REACH_DISTANCE = 12;

// Longer reach for third-person/mobile (camera is ~16+ world units from terrain)
const REACH_DISTANCE_THIRD_PERSON = 50;
// Touch aim: rays from the player's eyes along their facing, [pitch (rad), reach]

// Raycast step size (smaller = more precise, but slower)
// Using 0.25 for better accuracy near block edges and corners
const RAY_STEP = 0.25;

// Long press settings for mobile block interaction

/**
 * Does a ray point hit something minable? A shaped cell (pieces) only where a
 * piece is, so rays pass through its empty part.
 */
function hitsSolid(chunkManager, x, y, z, blockType) {
  if (!isSolid(blockType)) return false;
  const shape = chunkManager.getShape ? chunkManager.getShape(x, y, z) : 0;
  if (!shape) return true;
  const [sx, sy, sz] = subCubeOf(x, y, z, VOXEL_SIZE);
  return subFilled(shape, sx, sy, sz);
}

/** What the aim is on: the cell, plus which piece in a shaped cell. */
function aimKey(chunkManager, point) {
  if (!point) return null;
  const cell = `${Math.floor(point.x / VOXEL_SIZE)},${Math.floor(point.y / VOXEL_SIZE)},${Math.floor(point.z / VOXEL_SIZE)}`;
  const t = targetPiece(chunkManager, point);
  return t ? `${cell}:${t.piece.index}` : cell;
}

/** Aim on the half-block grid (which unit face): placing a piece follows it. */
function unitAimKey(point) {
  return point?.unit ? `${point.unit.join(',')}/${point.normal.join(',')}/${point.lookAxis}` : '';
}

// Mining progress geometry (flat bar above the block)
const miningBarBgGeometry = new THREE.PlaneGeometry(VOXEL_SIZE * 1.2, 0.3);
const miningBarBorderGeometry = new THREE.PlaneGeometry(VOXEL_SIZE * 1.2 + 0.08, 0.38);
// Pre-create geometry for highlight (reused across all renders)
const highlightBoxGeometry = new THREE.BoxGeometry(
  VOXEL_SIZE + 0.02,
  VOXEL_SIZE + 0.02,
  VOXEL_SIZE + 0.02
);
const highlightEdgesGeometry = new THREE.EdgesGeometry(highlightBoxGeometry);

// Pre-create geometry for placement preview
const previewBoxGeometry = new THREE.BoxGeometry(VOXEL_SIZE, VOXEL_SIZE, VOXEL_SIZE);

// Block type to color mapping for preview
const BLOCK_COLORS = {
  [BlockTypes.DIRT]: '#8B4513',
  [BlockTypes.GRASS]: '#228B22',
  [BlockTypes.STONE]: '#808080',
  [BlockTypes.WOOD]: '#DEB887',
  [BlockTypes.SAND]: '#F4A460',
  [BlockTypes.WATER]: '#4169E1',
  [BlockTypes.LEAVES]: '#32CD32',
  [BlockTypes.CAMPFIRE]: '#E6661A',
};

/**
 * Check if placing a block at (bx, by, bz) would overlap the player's body.
 * Player capsule: radius 0.6, centered at playerY+1.4, half-height 0.8
 * → AABB from (px±0.6, py+0, pz±0.6) to (px±0.6, py+2.8, pz±0.6)
 * Block AABB: center ± VOXEL_SIZE/2
 */
function wouldOverlapPlayer(bx, by, bz) {
  const pos = useGameStore.getState().player.position;
  const px = pos[0], py = pos[1], pz = pos[2];
  const half = VOXEL_SIZE / 2;

  // Player AABB
  const pMinX = px - 0.6, pMaxX = px + 0.6;
  const pMinY = py,       pMaxY = py + 2.8;
  const pMinZ = pz - 0.6, pMaxZ = pz + 0.6;

  // Block AABB
  const bMinX = bx - half, bMaxX = bx + half;
  const bMinY = by - half, bMaxY = by + half;
  const bMinZ = bz - half, bMaxZ = bz + half;

  return pMinX < bMaxX && pMaxX > bMinX &&
         pMinY < bMaxY && pMaxY > bMinY &&
         pMinZ < bMaxZ && pMaxZ > bMinZ;
}

/** The player's body as a box: [min, max] (capsule radius 0.6, 2.8 tall). */
function playerBox() {
  const [px, py, pz] = useGameStore.getState().player.position;
  return [[px - 0.6, py, pz - 0.6], [px + 0.6, py + 2.8, pz + 0.6]];
}

/**
 * Where the piece in hand would go for this aim, or null. The aim (`block`
 * from raycastAlongRay) carries the unit hit on the half-block grid.
 */
export function planHeldPiece(chunkManager, block, store = useGameStore.getState()) {
  if (!chunkManager || !block?.unit || !store.heldPiece) return null;
  const plan = planPiece(chunkManager, store.heldPiece, block, {
    rotation: store.pieceRotation || 0,
    lookAxis: block.lookAxis,
  });
  if (plan?.ok && boxesOverlap(plan.boxes, ...playerBox())) {
    return { ...plan, ok: false, reason: 'In the way' };
  }
  return plan;
}

/**
 * Place one piece of the piece in hand (a slab, plank or cube), paying one of
 * that piece. Mining it back gives the same piece.
 * @returns {boolean} true if it was placed
 */
function tryPlacePiece(chunkManager, block) {
  const store = useGameStore.getState();
  const key = store.heldPiece;
  const plan = planHeldPiece(chunkManager, block, store);
  if (!plan) return false;
  const warn = (text) => {
    const now = Date.now();
    if (now - _lastCostWarning > 1000) {
      _lastCostWarning = now;
      store.addPickupText(text, '#ff6666');
    }
  };
  if ((store.inventory.materials[key] || 0) < 1) {
    warn(`Need 1 ${materialName(key, 1)}: split blocks in Craft`);
    return false;
  }
  if (!plan.ok) {
    warn(plan.reason || "Doesn't fit there");
    return false;
  }
  if (!applyPiece(chunkManager, plan)) return false;
  notePlayerAction('place');
  store.removeMaterial(key, 1);
  return true;
}

/** World-space centre of the block adjacent to `block` across `face`, or null. */
function getAdjacentBlockCenter(block, face) {
  const x = Math.floor(block.x / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
  const y = Math.floor(block.y / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
  const z = Math.floor(block.z / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
  switch (face) {
    case 'top': return [x, y + VOXEL_SIZE, z];
    case 'bottom': return [x, y - VOXEL_SIZE, z];
    case 'north': return [x, y, z + VOXEL_SIZE];
    case 'south': return [x, y, z - VOXEL_SIZE];
    case 'east': return [x + VOXEL_SIZE, y, z];
    case 'west': return [x - VOXEL_SIZE, y, z];
    default: return null;
  }
}

// Throttle "not enough materials" feedback so holding the button doesn't spam it
let _lastCostWarning = 0;

/**
 * Place a block against `face` of `block`, paying its material cost.
 * Single code path for desktop first-person, third-person and mobile placement.
 * @returns {boolean} true if the block was placed
 */
/** "Need 1 stone block", plus a nudge to craft one when the player holds enough pieces. */
function needText(blockType, mat, qty, materials) {
  const label = `Need ${qty} ${materialName(mat, qty)}`;
  const piece = PIECES[mat];
  if (piece && !placementByVolume(blockType) && blocksAvailable(materials, mat) >= qty) {
    return `${label}: combine ${piece.name.toLowerCase()}s in Craft`;
  }
  return label;
}

function tryPlaceBlock(chunkManager, block, face, blockType) {
  if (!chunkManager || !block) return false;
  // A piece in hand places one piece on the half-block grid
  if (useGameStore.getState().heldPiece) return tryPlacePiece(chunkManager, block);
  if (!face) return false;
  const target = getAdjacentBlockCenter(block, face);
  if (!target) return false;
  const [px, py, pz] = target;

  // Placement position must be empty and not overlap the player
  if (isSolid(chunkManager.getBlock(px, py, pz))) return false;
  if (wouldOverlapPlayer(px, py, pz)) return false;

  // Pay for the block (mining it back returns the same materials)
  const store = useGameStore.getState();
  const cost = getPlacementCost(blockType);
  const { ok, missing } = canAffordPlacement(store.inventory.materials, cost, blockType);
  if (!ok) {
    const now = Date.now();
    if (now - _lastCostWarning > 1000) {
      _lastCostWarning = now;
      store.addPickupText(missing ? needText(blockType, missing, cost[missing], store.inventory.materials) : 'Cannot place that block', '#ff6666');
    }
    return false;
  }

  if (!chunkManager.setBlock(px, py, pz, blockType)) return false;
  notePlayerAction('place');
  const paid = payPlacement(blockType, store.inventory.materials);
  if (paid) store.setMaterials(paid);
  return true;
}

/**
 * Nearest block within USE_KEY_RANGE that has a use action (berry bush,
 * campfire, ...), scanning a small box around the player.
 * harvestOnly skips actions like picking up a campfire (the touch context
 * button only harvests, so it can't undo a campfire by accident).
 * @returns {{x:number,y:number,z:number,type:number}|null}
 */
export function findUsableBlock(chunkManager, playerPos, { harvestOnly = false } = {}) {
  if (!chunkManager || !playerPos) return null;
  const range = USE_KEY_RANGE;
  const [px, py, pz] = playerPos;
  const halfRange = Math.ceil(range / VOXEL_SIZE);
  const playerVX = Math.floor(px / VOXEL_SIZE);
  const playerVY = Math.floor(py / VOXEL_SIZE);
  const playerVZ = Math.floor(pz / VOXEL_SIZE);
  let bestDist = Infinity;
  let bestBlock = null;
  for (let dy = -1; dy <= 2; dy++) {
    for (let dz = -halfRange; dz <= halfRange; dz++) {
      for (let dx = -halfRange; dx <= halfRange; dx++) {
        const wx = (playerVX + dx) * VOXEL_SIZE + VOXEL_SIZE / 2;
        const wy = (playerVY + dy) * VOXEL_SIZE + VOXEL_SIZE / 2;
        const wz = (playerVZ + dz) * VOXEL_SIZE + VOXEL_SIZE / 2;
        const blockType = chunkManager.getBlock(wx, wy, wz);
        const action = BLOCK_USE_ACTIONS[blockType];
        if (!action || (harvestOnly && action.action !== 'harvest')) continue;
        const ddx = wx - px, ddy = wy - py, ddz = wz - pz;
        const dist = ddx * ddx + ddy * ddy + ddz * ddz;
        if (dist < bestDist && dist <= range * range) {
          bestDist = dist;
          bestBlock = { x: wx, y: wy, z: wz, type: blockType };
        }
      }
    }
  }
  return bestBlock;
}

/**
 * Touch reach: is the block within TOUCH_BLOCK_REACH blocks of the player,
 * counted on the voxel grid (sideways, and up or down from the feet; the
 * player is two blocks tall, so one more upward)?
 */
export function withinTouchReach(playerPos, block, reach = TOUCH_BLOCK_REACH) {
  if (!playerPos || !block) return false;
  const v = (n) => Math.floor(n / VOXEL_SIZE);
  const dx = Math.abs(v(block.x) - v(playerPos[0]));
  const dz = Math.abs(v(block.z) - v(playerPos[2]));
  const dy = v(block.y) - v(playerPos[1]);
  return dx <= reach && dz <= reach && dy >= -reach && dy <= reach + 1;
}

/**
 * Execute a use-action on a block (harvest berries, pick up campfire, etc.)
 */
function _executeUseAction(action, wx, wy, wz, blockType, chunkManager, store) {
  // Calculate drops
  for (const drop of action.drops) {
    const amount = drop.min === drop.max
      ? drop.min
      : drop.min + Math.floor(Math.random() * (drop.max - drop.min + 1));
    if (amount > 0) {
      store.addMaterial(drop.material, amount);
      store.addPickupText(`+${amount} ${drop.material}`, '#44ff44');
      store.addMinedPop?.([wx, wy, wz], drop.material);
    }
  }

  // Destroy block if specified
  if (action.destroyBlock) {
    chunkManager.setBlock(wx, wy, wz, BlockTypes.AIR);
  }

  return true;
}

/**
 * BlockHighlight - Wireframe cube showing selected block
 */
function BlockHighlight({ position, visible, scale }) {
  if (!visible || !position) return null;

  return (
    <group position={position} scale={scale || [1, 1, 1]}>
      <lineSegments geometry={highlightEdgesGeometry}>
        <lineBasicMaterial color="#ffffff" linewidth={2} />
      </lineSegments>
    </group>
  );
}

/**
 * PlacementPreview - Ghost block showing where block will be placed
 */
function PlacementPreview({ position, blockType, isValid, scale }) {
  if (!position) return null;

  const color = BLOCK_COLORS[blockType] || '#888888';

  return (
    <group position={position} scale={scale || [1, 1, 1]}>
      {/* Semi-transparent preview block */}
      <mesh geometry={previewBoxGeometry}>
        <meshBasicMaterial
          color={isValid ? color : '#ff0000'}
          transparent
          opacity={isValid ? 0.5 : 0.3}
          depthWrite={false}
        />
      </mesh>
      {/* Wireframe outline */}
      <lineSegments geometry={highlightEdgesGeometry}>
        <lineBasicMaterial color={isValid ? '#00ff00' : '#ff0000'} linewidth={2} />
      </lineSegments>
    </group>
  );
}

/**
 * MiningProgressBar - Shows mining progress above the targeted block
 * Always faces the camera (manual billboard since drei Billboard causes WebGL issues)
 */
function MiningProgressBar({ position, progress }) {
  const groupRef = useRef();
  const { camera } = useThree();

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.lookAt(camera.position);
    }
  });

  if (!position || progress <= 0) return null;

  const barWidth = VOXEL_SIZE * 1.2 * Math.min(1, progress);

  return (
    <group ref={groupRef} position={[position[0], position[1] + VOXEL_SIZE * 0.8, position[2]]}>
      {/* Black border frame */}
      <mesh geometry={miningBarBorderGeometry} position={[0, 0, -0.01]}>
        <meshBasicMaterial color="#000000" side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {/* Background */}
      <mesh geometry={miningBarBgGeometry}>
        <meshBasicMaterial color="#333333" transparent opacity={0.85} side={THREE.DoubleSide} depthTest={false} />
      </mesh>
      {/* Fill */}
      <mesh
        position={[-(VOXEL_SIZE * 1.2 - barWidth) / 2, 0, 0.01]}
        scale={[barWidth, 1, 1]}
      >
        <planeGeometry args={[1, 0.25]} />
        <meshBasicMaterial
          color={progress > 0.75 ? '#ff4444' : progress > 0.5 ? '#ffaa00' : '#44ff44'}
          side={THREE.DoubleSide}
          depthTest={false}
        />
      </mesh>
    </group>
  );
}

/**
 * Main BlockInteraction component
 */
export function BlockInteraction({ chunkManager }) {
  const { camera, gl, size, scene } = useThree();
  const [targetBlock, setTargetBlock] = useState(null);
  const [targetFace, setTargetFace] = useState(null);
  const [previewPosition, setPreviewPosition] = useState(null);
  const [previewValid, setPreviewValid] = useState(true);
  const [previewScale, setPreviewScale] = useState(null); // a piece's ghost size (null = a block)
  const [hoverAim, setHoverAim] = useState(null); // desktop third-person: { block, face } under the mouse
  const [miningProgress, setMiningProgress] = useState(0);
  const lastRaycast = useRef(0);

  // Progressive mining state
  const isHoldingMine = useRef(false);
  const miningAccum = useRef(0);
  const miningBlockKey = useRef(null); // "x,y,z" (+ ":piece") of what is being mined
  const miningPoint = useRef(null); // world point being mined
  const touchRetarget = useRef(null); // touch: re-aim under the held finger after a block breaks

  // Track if we're on mobile
  const isMobile = useRef(isTouchDevice());

  // Get selected block type, placement mode, first-person mode, and build mode from store
  // null = empty hand: right-click places nothing
  const selectedBlockType = useGameStore((state) => state.selectedBlockType);
  const firstPerson = useGameStore((state) => state.camera.firstPerson);
  // Touch with a block in hand: the context button places, so show the ghost block
  const touchPlacing = isMobile.current && selectedBlockType != null;
  const heldPiece = useGameStore((state) => state.heldPiece);
  const pieceRotation = useGameStore((state) => state.pieceRotation);
  // Re-check the ghost after placing (the world changed under it)
  const materialsVersion = useGameStore((state) => state.inventory.materials);
  const placingBuildingId = useGameStore((state) => state.placingBuildingId);

  // Raycaster for screen-space raycasting (mobile + desktop third-person)
  const raycasterRef = useRef(new THREE.Raycaster());

  // Raycaster for scene intersection (enemy detection in first-person)
  const sceneRaycasterRef = useRef(new THREE.Raycaster());

  // Desktop third-person mouse-down state (block under the cursor)
  const longPressTouchStart = useRef({ x: 0, y: 0 });
  const longPressBlock = useRef(null);
  const longPressFace = useRef(null);

  // Convert world position to block center position for highlight
  const highlightPosition = useMemo(() => {
    if (!targetBlock) return null;

    // A piece: the centre of that piece
    const piece = targetPiece(chunkManager, targetBlock);
    if (piece) {
      const [cx, cy, cz] = piece.center;
      const b = piece.box;
      const half = VOXEL_SIZE / 2;
      return [cx - half + (b[0] + b[3]) / 2, cy - half + (b[1] + b[4]) / 2, cz - half + (b[2] + b[5]) / 2];
    }

    // Block center = floor to grid + half voxel size
    const x = Math.floor(targetBlock.x / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
    const y = Math.floor(targetBlock.y / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
    const z = Math.floor(targetBlock.z / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;

    return [x, y, z];
  }, [targetBlock, chunkManager]);

  // Highlight size: a piece's box, or the whole block
  const highlightScale = useMemo(() => {
    const piece = targetBlock ? targetPiece(chunkManager, targetBlock) : null;
    if (!piece) return null;
    const b = piece.box;
    return [(b[3] - b[0]) / 2, (b[4] - b[1]) / 2, (b[5] - b[2]) / 2];
  }, [targetBlock, chunkManager]);

  // Calculate placement preview position (where block will be placed)
  // First-person and touch follow the target; desktop third-person follows the
  // mouse while something is in hand.
  useEffect(() => {
    const thirdPersonDesktop = !isMobile.current && !firstPerson;
    const showPreview = touchPlacing || firstPerson || (thirdPersonDesktop && selectedBlockType != null);
    const aim = thirdPersonDesktop ? hoverAim : { block: targetBlock, face: targetFace };
    if (!showPreview || !aim?.block || !chunkManager) {
      setPreviewPosition(null);
      return;
    }

    // A piece: its own box on the half-block grid
    if (heldPiece) {
      const plan = planHeldPiece(chunkManager, aim.block);
      if (!plan) {
        setPreviewPosition(null);
        return;
      }
      const min = [0, 1, 2].map((k) => Math.min(...plan.boxes.map((bx) => bx.min[k])));
      const max = [0, 1, 2].map((k) => Math.max(...plan.boxes.map((bx) => bx.max[k])));
      setPreviewPosition(min.map((v, k) => (v + max[k]) / 2));
      setPreviewScale(min.map((v, k) => (max[k] - v) / VOXEL_SIZE));
      setPreviewValid(plan.ok);
      return;
    }

    const target = aim.face ? getAdjacentBlockCenter(aim.block, aim.face) : null;
    if (!target) {
      setPreviewPosition(null);
      return;
    }
    const [placeX, placeY, placeZ] = target;

    // Check if placement is valid (position is empty and doesn't overlap player)
    const existingBlock = chunkManager.getBlock(placeX, placeY, placeZ);
    const isValid = !isSolid(existingBlock) && !wouldOverlapPlayer(placeX, placeY, placeZ);

    setPreviewPosition([placeX, placeY, placeZ]);
    setPreviewScale(null);
    setPreviewValid(isValid);
  }, [touchPlacing, firstPerson, targetBlock, targetFace, hoverAim, chunkManager, heldPiece, pieceRotation, selectedBlockType, materialsVersion]);

  // Reusable vectors for raycast (avoid allocations)
  const rayDirection = useRef(new THREE.Vector3());
  const rayOrigin = useRef(new THREE.Vector3());

  // Core raycast function - steps along a ray to find blocks
  const raycastAlongRay = useCallback((origin, direction, maxDistance = REACH_DISTANCE) => {
    if (!chunkManager) return { block: null, face: null };

    const ox = origin.x;
    const oy = origin.y;
    const oz = origin.z;
    const dir = direction;

    let lastAirX = 0,
      lastAirY = 0,
      lastAirZ = 0;
    let hasLastAir = false;

    // Step along ray
    for (let dist = 0; dist < maxDistance; dist += RAY_STEP) {
      const cx = ox + dir.x * dist;
      const cy = oy + dir.y * dist;
      const cz = oz + dir.z * dist;

      const blockType = chunkManager.getBlock(cx, cy, cz);

      if (hitsSolid(chunkManager, cx, cy, cz, blockType)) {
        // Found a solid block - determine which face was hit
        let face = null;
        if (hasLastAir) {
          // Compare voxel grid positions (not float positions) to find
          // which face boundary was actually crossed.  Float differences
          // are always proportional to the ray direction and misidentify
          // the face when the ray enters at an oblique angle.
          const solidVX = Math.floor(cx / VOXEL_SIZE);
          const solidVY = Math.floor(cy / VOXEL_SIZE);
          const solidVZ = Math.floor(cz / VOXEL_SIZE);
          const airVX = Math.floor(lastAirX / VOXEL_SIZE);
          const airVY = Math.floor(lastAirY / VOXEL_SIZE);
          const airVZ = Math.floor(lastAirZ / VOXEL_SIZE);

          const dx = solidVX - airVX;
          const dy = solidVY - airVY;
          const dz = solidVZ - airVZ;

          const absDx = Math.abs(dx);
          const absDy = Math.abs(dy);
          const absDz = Math.abs(dz);

          if (absDx > absDy && absDx > absDz) {
            face = dx > 0 ? 'west' : 'east';
          } else if (absDy > absDx && absDy > absDz) {
            face = dy > 0 ? 'bottom' : 'top';
          } else if (absDz > absDx && absDz > absDy) {
            face = dz > 0 ? 'south' : 'north';
          } else {
            // Diagonal voxel crossing (rare, near corners) —
            // fall back to ray direction as tiebreaker
            const rAbsDx = Math.abs(dir.x);
            const rAbsDy = Math.abs(dir.y);
            const rAbsDz = Math.abs(dir.z);
            if (rAbsDy >= rAbsDx && rAbsDy >= rAbsDz) {
              face = dir.y > 0 ? 'bottom' : 'top';
            } else if (rAbsDx >= rAbsDz) {
              face = dir.x > 0 ? 'west' : 'east';
            } else {
              face = dir.z > 0 ? 'south' : 'north';
            }
          }
        } else {
          // Ray origin is inside a solid block — infer face from ray direction
          const rAbsDx = Math.abs(dir.x);
          const rAbsDy = Math.abs(dir.y);
          const rAbsDz = Math.abs(dir.z);
          if (rAbsDy >= rAbsDx && rAbsDy >= rAbsDz) {
            face = dir.y > 0 ? 'bottom' : 'top';
          } else if (rAbsDx >= rAbsDz) {
            face = dir.x > 0 ? 'west' : 'east';
          } else {
            face = dir.z > 0 ? 'south' : 'north';
          }
        }

        // The same ray on the half-block grid, for placing pieces
        const unitHit = raycastUnits(
          (x, y, z) => hitsSolid(chunkManager, x, y, z, chunkManager.getBlock(x, y, z)),
          origin, dir, maxDistance
        );
        const block = { x: cx, y: cy, z: cz };
        if (unitHit) {
          block.unit = unitHit.unit;
          block.normal = unitHit.normal;
          block.lookAxis = Math.abs(dir.x) >= Math.abs(dir.z) ? 0 : 2;
        }
        return {
          block,
          face,
          adjacentPos: hasLastAir ? { x: lastAirX, y: lastAirY, z: lastAirZ } : null,
        };
      }

      lastAirX = cx;
      lastAirY = cy;
      lastAirZ = cz;
      hasLastAir = true;
    }

    return { block: null, face: null, adjacentPos: null };
  }, [chunkManager]);

  // Raycast from camera center (desktop first-person mode)
  const raycastForBlock = useCallback(() => {
    camera.getWorldDirection(rayDirection.current);
    rayOrigin.current.copy(camera.position);
    return raycastAlongRay(rayOrigin.current, rayDirection.current);
  }, [camera, raycastAlongRay]);

  // Raycast from screen position (mobile tap-to-target)
  // Uses longer reach because third-person camera is far from terrain
  const raycastFromScreen = useCallback((screenX, screenY) => {
    // Convert screen coordinates to normalized device coordinates (-1 to +1)
    const ndcX = (screenX / size.width) * 2 - 1;
    const ndcY = -(screenY / size.height) * 2 + 1;

    // Set up raycaster from camera through screen point
    raycasterRef.current.setFromCamera({ x: ndcX, y: ndcY }, camera);

    const ray = raycasterRef.current.ray;
    return raycastAlongRay(ray.origin, ray.direction, REACH_DISTANCE_THIRD_PERSON);
  }, [camera, size, raycastAlongRay]);

  // Track previous target to avoid unnecessary state updates
  const prevTargetRef = useRef({ block: null, face: null });

  // Update raycast every few frames (first-person mode OR third-person build mode)
  const zoneMode = useGameStore((state) => state.zoneMode || state.planMode); // planning: no mining or placing

  // Mining and placing are always on in Play (desktop: mouse; touch: the
  // context button acting on the block in front of the player).
  const blocksActive = !zoneMode && !placingBuildingId;

  useFrame(() => {
    // Block targeting runs in Play (desktop) or build mode (touch); not while zoning or placing
    if (!blocksActive) {
      if (targetBlock !== null && !isHoldingMine.current) {
        setTargetBlock(null);
        setTargetFace(null);
        prevTargetRef.current = { block: null, face: null };
      }
      return;
    }

    // Touch: the target is whatever block a finger is holding (see the touch handlers)
    if (isMobile.current) return;

    // Third-person desktop: no continuous raycasting (the mouse picks blocks)
    if (!firstPerson) {
      // Clear target when not in first-person, BUT keep it while actively mining
      if (!isMobile.current && targetBlock !== null && !isHoldingMine.current) {
        setTargetBlock(null);
        setTargetFace(null);
        prevTargetRef.current = { block: null, face: null };
      }
      return;
    }

    const now = Date.now();
    if (now - lastRaycast.current < 50) return; // 20 raycasts per second max
    lastRaycast.current = now;

    const result = raycastForBlock();
    const prev = prevTargetRef.current;

    // Only update state if target actually changed (avoid re-renders)
    // (another piece in the same cell counts as a new target)
    const blockChanged = aimKey(chunkManager, result.block) !== aimKey(chunkManager, prev.block) ||
      (useGameStore.getState().heldPiece != null && unitAimKey(result.block) !== unitAimKey(prev.block));

    if (blockChanged || result.face !== prev.face) {
      setTargetBlock(result.block);
      setTargetFace(result.face);
      prevTargetRef.current = { block: result.block, face: result.face };
    }
  });

  // Progressive mining: accumulate progress while holding on a block
  useFrame((_, delta) => {
    if (!blocksActive || !isHoldingMine.current || !chunkManager) {
      if (miningAccum.current > 0) {
        miningAccum.current = 0;
        miningBlockKey.current = null;
        setMiningProgress(0);
      }
      return;
    }

    // If no target block but we're holding mine, keep using the last known block
    // This prevents mining interruption from brief raycast misses during camera movement
    if (!targetBlock && miningBlockKey.current) {
      // Continue mining the last known block
    } else if (!targetBlock) {
      return;
    }

    // The point being mined (kept while the aim briefly misses)
    if (targetBlock) miningPoint.current = targetBlock;
    const point = miningPoint.current;
    if (!point) return;
    const blockKey = aimKey(chunkManager, point);

    // Reset if the target changed: another block, or another piece of a cell
    if (targetBlock && miningBlockKey.current && miningBlockKey.current !== blockKey) {
      miningAccum.current = 0;
      miningBlockKey.current = blockKey;
    } else if (!miningBlockKey.current) {
      miningBlockKey.current = blockKey;
    }

    const [worldX, worldY, worldZ] = cellCenter(point.x, point.y, point.z);
    const blockType = chunkManager.getBlock(worldX, worldY, worldZ);
    if (!blockType || blockType === BlockTypes.AIR || blockType === BlockTypes.BEDROCK) return;
    // A piece takes part of a block's time (a slab or plank half)
    const piece = targetPiece(chunkManager, point);
    const sizeFactor = piece ? pieceMiningFraction(piece.kind) : 1;

    const hardness = getBlockHardness(blockType);
    const store = useGameStore.getState();
    const equippedTool = usableTool(store.equipment?.weapon); // broken = bare hands
    const harvestSpeed = equippedTool?.stats?.harvestSpeed || HARVEST_SPEED_BARE_HANDS;
    const breakTime = (hardness / harvestSpeed) * sizeFactor;

    // Accumulate mining progress
    miningAccum.current += delta;
    notePlayerAction('mine');
    const progress = Math.min(1, miningAccum.current / breakTime);
    setMiningProgress(progress);

    // Block breaks when progress reaches 100%
    if (miningAccum.current >= breakTime) {
      mineBlock();
      miningAccum.current = 0;
      miningBlockKey.current = null;
      setMiningProgress(0);
      // Force immediate raycast so continuous mining picks up the next block
      lastRaycast.current = 0;
      // Touch: keep digging at the same spot on screen while the finger stays down
      if (isMobile.current) touchRetarget.current?.();
    }
  });

  // Handle block mining (destroy block)
  const mineBlock = useCallback(() => {
    if (!targetBlock || !chunkManager) return false;

    const [blockX, blockY, blockZ] = cellCenter(targetBlock.x, targetBlock.y, targetBlock.z);

    // Get current block type before destroying (for future inventory)
    const currentBlock = chunkManager.getBlock(blockX, blockY, blockZ);

    // Don't allow breaking bedrock
    if (currentBlock === BlockTypes.BEDROCK) return false;

    // A shaped cell gives back just the piece that was hit (both halves of a plank)
    const mined = minePiece(chunkManager, targetBlock);

    // Otherwise the whole block goes
    const success = mined ? true : chunkManager.setBlock(blockX, blockY, blockZ, BlockTypes.AIR);

    if (success) {
      // Force immediate raycast to update target for consecutive mining
      lastRaycast.current = 0;
      prevTargetRef.current = { block: null, face: null };
      // Synchronous raycast so next click has fresh target
      // (touch re-aims under the held finger instead: touchRetarget)
      const result = isMobile.current ? { block: null, face: null } : raycastForBlock();
      setTargetBlock(result.block);
      setTargetFace(result.face);
      prevTargetRef.current = { block: result.block, face: result.face };

      // Calculate and grant drops
      const store = useGameStore.getState();
      const equippedTool = usableTool(store.equipment?.weapon);
      const toolTier = equippedTool?.stats?.toolTier || 0;
      const drops = mined ? mined.drops : calculateDrops(currentBlock, toolTier, pieceTiers(equippedTool));

      // Mining wears the tool, harder blocks more (a piece wears it less)
      const wear = getBlockHardness(currentBlock) * (mined ? pieceMiningFraction(mined.kind) : 1);
      if (equippedTool && store.wearEquippedTool(wear)) {
        store.addPickupText(`${equippedTool.name} broke! Repair it in the inventory`, '#ff6b6b');
        audioManager.play('error');
      }

      drops.forEach((drop, i) => {
        store.addMaterial(drop.material, drop.amount);
        store.addPickupText(`+${drop.amount} ${materialName(drop.material, drop.amount)}`, '#44ff44');
        if (i < 2) store.addMinedPop([blockX, blockY, blockZ], drop.material);
      });

      // Audio + quest tracking for mining
      audioManager.play('lootDrop');
      drops.forEach((drop) => {
        // Quests count the material: a stone slab counts as stone
        try { getQuestManager().emit('itemCollected', baseMaterial(drop.material)); } catch (_) { /* quest system not ready */ }
      });
    }

    return success;
  }, [targetBlock, chunkManager, raycastForBlock]);

  // Handle block placement
  const placeBlock = useCallback((blockType) => {
    if (!targetBlock || !chunkManager) return false;

    const success = tryPlaceBlock(chunkManager, targetBlock, targetFace, blockType);

    if (success) {
      // Force immediate raycast to update target for consecutive placement
      lastRaycast.current = 0;
      prevTargetRef.current = { block: null, face: null };
      // Synchronous raycast so next click has fresh target
      const result = raycastForBlock();
      setTargetBlock(result.block);
      setTargetFace(result.face);
      prevTargetRef.current = { block: result.block, face: result.face };
    }

    return success;
  }, [targetBlock, targetFace, chunkManager, raycastForBlock]);

  // E key "use" action — interact with usable blocks (berry bushes, campfires, etc.)
  const useBlockCooldown = useRef(0);

  const useBlock = useCallback(() => {
    const now = Date.now();
    if (now - useBlockCooldown.current < USE_KEY_COOLDOWN) {
      useGameStore.getState()._debugStats.useKeyCooldownLeft = USE_KEY_COOLDOWN - (now - useBlockCooldown.current);
      return false;
    }

    const store = useGameStore.getState();
    const playerPos = store.player.position;

    // If stockpile panel is open, close it
    if (store.activeStockpileZoneId) {
      store.closeStockpilePanel();
      useBlockCooldown.current = now;
      return true;
    }

    // If construction panel is open, close it
    if (store.activeConstructionSiteId) {
      store.closeConstructionPanel();
      useBlockCooldown.current = now;
      return true;
    }

    // If NPC panel is open, close it
    if (store.activeNPCId) {
      store.closeNPCPanel();
      useBlockCooldown.current = now;
      return true;
    }

    // Check for rift interaction FIRST (doesn't need chunkManager)
    const riftManager = store._riftManager;
    if (riftManager) {
      // Build alive enemy set for cleaning stale monster IDs
      const aliveEnemyIds = new Set(store.enemies.map(e => e.id));

      for (const rift of riftManager.rifts) {
        if (rift.state === 'CLOSED') continue;
        if (rift.state !== 'ACTIVE' && rift.state !== 'WOUNDED') continue;

        // Clean stale monster IDs (monsters may have died since last rift tick)
        rift.spawnedMonsterIds = rift.spawnedMonsterIds.filter(id => aliveEnemyIds.has(id));

        const rdx = playerPos[0] - rift.x;
        const rdz = playerPos[2] - rift.z;
        const rdist = Math.sqrt(rdx * rdx + rdz * rdz);

        if (rdist < 24) {
          // Show distance feedback so player knows they're getting close
          if (rdist >= 8) {
            store.addPickupText(`Rift nearby (${Math.round(rdist)} units away — get closer!)`, '#aa88ff');
            useBlockCooldown.current = now;
            return true;
          }

          // Must kill all rift monsters first
          if (rift.spawnedMonsterIds.length > 0) {
            store.addPickupText('Kill all rift monsters first!', '#ff6666');
            useBlockCooldown.current = now;
            return true;
          }

          const worldNow = store.worldTime.elapsed;
          if (rift.state === 'ACTIVE') {
            if (riftManager.beginClosing(rift.id, worldNow)) {
              store.addPickupText('Rift closing begun! Defend the anchor!', '#aa44ff');
              useBlockCooldown.current = now;
              return true;
            }
          } else if (rift.state === 'WOUNDED') {
            if (riftManager.resumeClosing(rift.id, worldNow)) {
              store.addPickupText('Resuming rift purification!', '#aa44ff');
              useBlockCooldown.current = now;
              return true;
            }
          }
        }
      }
    }

    // A construction site or building, a stockpile, or a settler (see interactTarget.js)
    const target = findInteractTarget(store, playerPos);
    if (target) {
      if (target.kind === 'site' || target.kind === 'building') store.setActiveConstructionSite(target.id);
      else if (target.kind === 'stockpile') store.setActiveStockpileZone(target.id);
      else store.setActiveNPC(target.id);
      useBlockCooldown.current = now;
      return true;
    }

    // Block interactions need chunkManager
    if (!chunkManager) return false;

    // In first-person with a target block: use it if usable
    if (firstPerson && targetBlock) {
      const bx = Math.floor(targetBlock.x / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
      const by = Math.floor(targetBlock.y / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
      const bz = Math.floor(targetBlock.z / VOXEL_SIZE) * VOXEL_SIZE + VOXEL_SIZE / 2;
      const blockType = chunkManager.getBlock(bx, by, bz);
      const action = BLOCK_USE_ACTIONS[blockType];
      if (action) {
        useBlockCooldown.current = now;
        return _executeUseAction(action, bx, by, bz, blockType, chunkManager, store);
      }
    }

    // Otherwise (or if first-person had no usable target): proximity scan
    if (!firstPerson || !targetBlock) {
      const bestBlock = findUsableBlock(chunkManager, playerPos);

      if (bestBlock) {
        useBlockCooldown.current = now;
        const action = BLOCK_USE_ACTIONS[bestBlock.type];
        return _executeUseAction(action, bestBlock.x, bestBlock.y, bestBlock.z, bestBlock.type, chunkManager, store);
      }
    }

    return false;
  }, [chunkManager, firstPerson, targetBlock]);

  // Expose interaction methods to store for UI/controls to use
  React.useEffect(() => {
    const store = useGameStore.getState();

    // Add interaction methods to store
    store.mineBlock = mineBlock;
    store.placeBlock = () => placeBlock(selectedBlockType);
    store.getTargetBlock = () => targetBlock;
    store.useBlock = useBlock;

    return () => {
      // Cleanup
      store.mineBlock = null;
      store.placeBlock = null;
      store.getTargetBlock = null;
      store.useBlock = null;
    };
  }, [mineBlock, placeBlock, selectedBlockType, targetBlock, useBlock]);

  // Check for enemy along camera center ray (first-person attack)
  const checkEnemyFromCamera = useCallback(() => {
    camera.getWorldDirection(rayDirection.current);
    sceneRaycasterRef.current.set(camera.position, rayDirection.current);
    sceneRaycasterRef.current.far = REACH_DISTANCE;
    const intersects = sceneRaycasterRef.current.intersectObjects(scene.children, true);

    for (let i = 0; i < intersects.length; i++) {
      let obj = intersects[i].object;
      while (obj) {
        if (obj.userData?.isEnemy && obj.userData?.takeDamage) {
          return { hit: intersects[i], enemyData: obj.userData };
        }
        obj = obj.parent;
      }
    }
    return null;
  }, [camera, scene]);

  // Desktop: pointer down/up handlers for first-person mining/placement/attack
  useEffect(() => {
    const handlePointerDown = (event) => {
      // Mobile uses long-press touch handlers instead
      if (isMobile.current) return;

      const store = useGameStore.getState();
      const isPointerLocked = document.pointerLockElement != null;

      if (firstPerson && isPointerLocked) {
        if (event.button === 0) {
          // Left click: check for enemy FIRST (works outside build mode), then mine block
          const enemy = checkEnemyFromCamera();
          if (enemy) {
            // Try spell first, then fall back to melee
            const spell = getSpellById(store.activeSpellId);
            let spellFired = false;
            if (spell && store.player.mana >= spell.manaCost) {
              const cooldown = store.getSpellCooldown(spell.id);
              if (cooldown <= 0) {
                const result = executeSpell(spell, store.player, store);
                if (result.success) {
                  store.setSpellCooldown(spell.id, spell.cooldown);
                  spellFired = true;
                }
              }
            }

            // Melee fallback: if spell didn't fire, swing melee
            if (!spellFired) {
              const meleeCooldown = store.getSpellCooldown('__melee__');
              if (!meleeCooldown || meleeCooldown <= 0) {
                // Get facing angle from camera direction
                camera.getWorldDirection(rayDirection.current);
                const facingAngle = Math.atan2(rayDirection.current.x, rayDirection.current.z);
                performMeleeAttack(store, store.player.position, facingAngle, store.enemies);
                store.setSpellCooldown('__melee__', MELEE_COOLDOWN);
              }
            }
          } else if (!store.zoneMode && !store.planMode && !store.placingBuildingId) {
            // Not an enemy: start mining the targeted block (hold to break)
            isHoldingMine.current = true;
            miningAccum.current = 0;
            miningBlockKey.current = null;
          }
        } else if (event.button === 2) {
          // Place only with a block in hand (the empty hand places nothing)
          if (store.selectedBlockType == null || store.zoneMode || store.planMode || store.placingBuildingId) return;
          // Right click: place block — do a fresh raycast to get current target
          const freshResult = raycastForBlock();
          if (freshResult.block && freshResult.face) {
            setTargetBlock(freshResult.block);
            setTargetFace(freshResult.face);
            prevTargetRef.current = { block: freshResult.block, face: freshResult.face };
            // Place adjacent to the freshly raycasted block
            if (tryPlaceBlock(chunkManager, freshResult.block, freshResult.face, selectedBlockType)) {
              // Refresh target after placement
              lastRaycast.current = 0;
              prevTargetRef.current = { block: null, face: null };
            }
          }
        }
      }
    };

    const handlePointerUp = (event) => {
      if (event.button === 0) {
        isHoldingMine.current = false;
        miningAccum.current = 0;
        miningBlockKey.current = null;
        setMiningProgress(0);
      }
    };

    const handleContextMenu = (event) => {
      // Prevent context menu in first-person mode so right-click works for placement
      if (firstPerson && document.pointerLockElement != null) {
        event.preventDefault();
      }
    };

    // Listen on document to catch events when pointer lock is active
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('pointerup', handlePointerUp);
    document.addEventListener('contextmenu', handleContextMenu);

    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('pointerup', handlePointerUp);
      document.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [gl, camera, mineBlock, placeBlock, selectedBlockType, firstPerson, checkEnemyFromCamera, chunkManager, raycastForBlock]);

  // Desktop third-person: left-click to mine, right-click to place
  // Uses a store flag (_blockClickActive) to coordinate with TouchControls
  useEffect(() => {
    if (isMobile.current) return;

    const canvas = gl.domElement;

    // The block under the mouse, if it's within MOUSE_BLOCK_REACH of the player
    // (further away, a left-click casts the spell instead)
    const raycastFromMouse = (x, y) => {
      const hit = raycastFromScreen(x, y);
      if (hit.block && !withinTouchReach(useGameStore.getState().player.position, hit.block, MOUSE_BLOCK_REACH)) {
        return { block: null, face: null, adjacentPos: null };
      }
      return hit;
    };

    // Desktop third-person: what's under the mouse, for the placement ghost (20 per second at most)
    const lastMouse = { x: 0, y: 0 };
    let lastHover = 0;
    const hoverAt = (clientX, clientY, force = false) => {
      const now = performance.now();
      if (!force && now - lastHover < 50) return;
      lastHover = now;
      const rect = canvas.getBoundingClientRect();
      const hit = raycastFromMouse(clientX - rect.left, clientY - rect.top);
      setHoverAim(hit.block ? { block: hit.block, face: hit.face } : null);
    };

    // Track right-click for block placement (without drag)
    const rightClickStart = { x: 0, y: 0 };
    let rightClickPending = false;
    let rightClickResult = null;

    const handleMouseDown = (event) => {
      // Only handle in third-person mode (not pointer locked)
      if (document.pointerLockElement) return;

      // Mining and placing work in Play; not while zoning or placing a building
      const st = useGameStore.getState();
      if (st.zoneMode || st.planMode || st.placingBuildingId) return;

      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;

      if (event.button === 2) {
        if (st.selectedBlockType == null) return; // empty hand: right-drag is just the camera
        // Right-click: record position and raycast for potential block placement
        rightClickStart.x = event.clientX;
        rightClickStart.y = event.clientY;
        rightClickPending = true;
        rightClickResult = raycastFromMouse(x, y);
        return;
      }

      if (event.button !== 0) return;

      // First check if click hits an enemy (scene raycast) — if so, let TouchControls handle it
      const ndcX = (x / rect.width) * 2 - 1;
      const ndcY = -(y / rect.height) * 2 + 1;
      const sceneRc = raycasterRef.current;
      sceneRc.setFromCamera({ x: ndcX, y: ndcY }, camera);
      sceneRc.far = REACH_DISTANCE_THIRD_PERSON;
      const sceneHits = sceneRc.intersectObjects(scene.children, true);
      for (let i = 0; i < sceneHits.length; i++) {
        let obj = sceneHits[i].object;
        while (obj) {
          if (obj.userData?.isEnemy) {
            // Click is on an enemy — don't intercept, let TouchControls attack
            return;
          }
          obj = obj.parent;
        }
      }

      // Just beside an enemy on screen counts as clicking it (TouchControls attacks)
      if (enemyNearScreenPoint(
        useGameStore.getState(), camera, { x, y }, { width: rect.width, height: rect.height },
        ENEMY_CLICK_ASSIST_PX, (p) => new THREE.Vector3(p[0], p[1], p[2])
      )) return;

      // Raycast from mouse position to find block
      const result = raycastFromMouse(x, y);

      if (result.block) {
        // Block found — set store flag to suppress TouchControls movement
        useGameStore.getState()._blockClickActive = true;
        // Also stamp longPressAt as backup suppression signal
        canvas.dataset.longPressAt = String(Date.now());

        longPressBlock.current = result.block;
        longPressFace.current = result.face;
        longPressTouchStart.current = { x: event.clientX, y: event.clientY };

        // Show highlight immediately
        setTargetBlock(result.block);
        setTargetFace(result.face);

        // Desktop: always mine on left-click (no toggle mode)
        isHoldingMine.current = true;
        miningAccum.current = 0;
        // Set miningBlockKey immediately so mining progress can find the block
        miningBlockKey.current = aimKey(chunkManager, result.block);
      }
    };

    const handleMouseMove = (event) => {
      // Cancel right-click placement if mouse moved too far (it's a camera drag)
      if (rightClickPending) {
        const rdx = event.clientX - rightClickStart.x;
        const rdy = event.clientY - rightClickStart.y;
        if (rdx * rdx + rdy * rdy > 25) { // 5px threshold
          rightClickPending = false;
          rightClickResult = null;
        }
      }

      lastMouse.x = event.clientX;
      lastMouse.y = event.clientY;
      if (!isHoldingMine.current) {
        // Something in hand: the ghost follows the mouse
        const st = useGameStore.getState();
        if (st.selectedBlockType != null && !document.pointerLockElement) hoverAt(event.clientX, event.clientY);
        return;
      }

      // Re-raycast from current mouse position to check if still on the same block
      const rect = canvas.getBoundingClientRect();
      const mx = event.clientX - rect.left;
      const my = event.clientY - rect.top;
      const moveResult = raycastFromMouse(mx, my);

      if (moveResult.block && miningBlockKey.current) {
        // Same block, or the same piece of a shaped cell
        const newKey = aimKey(chunkManager, moveResult.block);
        if (newKey === miningBlockKey.current) {
          // Still on the same block — continue mining, update face highlight
          setTargetBlock(moveResult.block);
          setTargetFace(moveResult.face);
          return;
        }
      }

      // Cursor moved off the block — cancel mining
      longPressBlock.current = null;
      longPressFace.current = null;
      isHoldingMine.current = false;
      miningAccum.current = 0;
      setMiningProgress(0);
      setTargetBlock(null);
      setTargetFace(null);
    };

    const handleMouseUp = (event) => {
      // Right-click release: place block if mouse didn't drag
      if (event.button === 2 && rightClickPending && rightClickResult?.block) {
        const result = rightClickResult;
        const block = result.block;
        const face = result.face;
        if (block && face && chunkManager) {
          const store = useGameStore.getState();
          if (store.selectedBlockType != null && tryPlaceBlock(chunkManager, block, face, store.selectedBlockType)) {
            hoverAt(lastMouse.x, lastMouse.y, true); // the ghost moves on
          }
        }
        rightClickPending = false;
        rightClickResult = null;
        return;
      }
      rightClickPending = false;
      rightClickResult = null;

      // Stop mining on mouseup
      longPressBlock.current = null;
      longPressFace.current = null;
      isHoldingMine.current = false;
      miningAccum.current = 0;
      setMiningProgress(0);
      setTargetBlock(null);
      setTargetFace(null);
    };

    const handleContextMenu3P = (event) => {
      // Prevent context menu in third-person mode on canvas
      if (!document.pointerLockElement) {
        event.preventDefault();
      }
    };

    canvas.addEventListener('mousedown', handleMouseDown);
    canvas.addEventListener('contextmenu', handleContextMenu3P);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('mousedown', handleMouseDown);
      canvas.removeEventListener('contextmenu', handleContextMenu3P);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [gl, chunkManager, raycastFromScreen, firstPerson, camera, scene.children]);

  // Touch: hold a block on screen (within TOUCH_BLOCK_REACH) to mine it;
  // a quick tap places the held block or harvests a bush (TouchControls'
  // tap pipeline calls tapBlock after its enemy check). Any other drag is
  // the camera (CameraRotateControls), which ignores a finger that's mining.
  useEffect(() => {
    if (!isMobile.current) return;
    const canvas = gl.domElement;
    canvas.style.webkitUserSelect = 'none';
    canvas.style.userSelect = 'none';
    canvas.style.webkitTouchCallout = 'none';
    const handleContextMenu = (e) => e.preventDefault();
    canvas.addEventListener('contextmenu', handleContextMenu);

    const say = (text) => useGameStore.getState().addPickupText(text, '#ffb347');
    const aimAt = (clientX, clientY) => {
      const r = canvas.getBoundingClientRect();
      const hit = raycastFromScreen(clientX - r.left, clientY - r.top);
      if (!hit.block) return null;
      return { ...hit, inReach: withinTouchReach(useGameStore.getState().player.position, hit.block) };
    };
    const canAct = () => {
      const st = useGameStore.getState();
      return st.gameState === 'playing' && !st.planMode && !st.zoneMode && !st.placingBuildingId;
    };

    const setTarget = (block, face) => {
      setTargetBlock(block);
      setTargetFace(face);
      prevTargetRef.current = { block, face };
    };
    const stopMining = () => {
      isHoldingMine.current = false;
      miningAccum.current = 0;
      miningBlockKey.current = null;
      setMiningProgress(0);
      setTarget(null, null);
      touchRetarget.current = null;
      useGameStore.getState()._touchMining = false;
    };

    let press = null; // { id, x, y, timer, mining }
    const cancel = () => {
      if (!press) return;
      if (press.timer) clearTimeout(press.timer);
      if (press.mining) stopMining();
      press = null;
    };
    const startMining = () => {
      if (!press) return;
      press.timer = null;
      if (!canAct()) return;
      const hit = aimAt(press.x, press.y);
      if (!hit) return;
      canvas.dataset.longPressAt = String(Date.now()); // no tap action on release
      if (!hit.inReach) {
        say(`Too far to mine (${TOUCH_BLOCK_REACH} blocks)`);
        return;
      }
      press.mining = true;
      useGameStore.getState()._touchMining = true;
      setTarget(hit.block, hit.face);
      isHoldingMine.current = true;
      miningAccum.current = 0;
      miningBlockKey.current = null;
      navigator.vibrate?.(10);
      const { x, y } = press;
      touchRetarget.current = () => {
        const next = aimAt(x, y);
        if (next?.inReach) setTarget(next.block, next.face);
        else setTarget(null, null); // dug through to nothing in reach: stop
      };
    };

    const onStart = (e) => {
      if (e.targetTouches.length !== 1) {
        cancel(); // a second finger: pinch
        return;
      }
      cancel();
      const t = e.changedTouches[0];
      press = { id: t.identifier, x: t.clientX, y: t.clientY, timer: null, mining: false };
      press.timer = setTimeout(startMining, TOUCH_MINE_HOLD_MS);
    };
    const onMove = (e) => {
      if (!press || press.mining) return;
      const t = Array.from(e.changedTouches).find((tt) => tt.identifier === press.id);
      if (t && Math.hypot(t.clientX - press.x, t.clientY - press.y) > TAP_MAX_DISTANCE_PX) {
        cancel(); // a drag: the camera's
      }
    };
    const onEnd = (e) => {
      if (!press) return;
      if (!Array.from(e.changedTouches).some((tt) => tt.identifier === press.id)) return;
      cancel();
    };
    canvas.addEventListener('touchstart', onStart, { passive: true });
    canvas.addEventListener('touchmove', onMove, { passive: true });
    canvas.addEventListener('touchend', onEnd);
    canvas.addEventListener('touchcancel', onEnd);

    const store = useGameStore.getState();
    store._touchActions = {
      /** A quick tap at a screen point. @returns {boolean} handled (no spell cast) */
      tapBlock: (clientX, clientY) => {
        if (!canAct() || !chunkManager) return false;
        const hit = aimAt(clientX, clientY);
        if (!hit) return false;
        const st = useGameStore.getState();
        const type = chunkManager.getBlock(hit.block.x, hit.block.y, hit.block.z);
        const use = BLOCK_USE_ACTIONS[type];
        if (use?.action === 'harvest') {
          if (!hit.inReach) return false;
          return _executeUseAction(use, hit.block.x, hit.block.y, hit.block.z, type, chunkManager, st);
        }
        if (st.selectedBlockType == null) return false;
        if (!hit.inReach) {
          say(`Too far to place (${TOUCH_BLOCK_REACH} blocks)`);
          return true;
        }
        tryPlaceBlock(chunkManager, hit.block, hit.face, st.selectedBlockType);
        return true;
      },
    };

    return () => {
      cancel();
      canvas.removeEventListener('contextmenu', handleContextMenu);
      canvas.removeEventListener('touchstart', onStart);
      canvas.removeEventListener('touchmove', onMove);
      canvas.removeEventListener('touchend', onEnd);
      canvas.removeEventListener('touchcancel', onEnd);
      useGameStore.getState()._touchActions = null;
      useGameStore.getState()._touchMining = false;
    };
  }, [gl, chunkManager, raycastFromScreen]);

  return (
    <>
      {/* Mining target highlight — hidden on touch while a block is in hand (the ghost shows instead) */}
      {(!touchPlacing || firstPerson) && (
        <BlockHighlight
          position={highlightPosition}
          scale={highlightScale}
          visible={targetBlock !== null}
        />
      )}

      {/* Placement preview ghost block — show in placement mode or first-person (right-click places) */}
      {previewPosition && (
        <PlacementPreview
          position={previewPosition}
          scale={previewScale}
          blockType={selectedBlockType}
          isValid={previewValid}
        />
      )}

      {/* Mining progress bar */}
      <MiningProgressBar position={highlightPosition} progress={miningProgress} />
    </>
  );
}

export default BlockInteraction;
