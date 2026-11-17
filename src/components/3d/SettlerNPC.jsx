/**
 * SettlerNPC — 3D voxel humanoid for settlement NPCs.
 *
 * Kinematic body (we control position, not physics). Walks toward target,
 * idle-wanders, shows status indicators. Combat system ignores these
 * (userData.isNPC, NOT isEnemy).
 *
 * Phase 2.5: Added arms, work animations, thought bubbles, hauling visuals.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CapsuleCollider } from '@react-three/rapier';
import { getActiveScaffoldRoutes, scaffoldHeightAt } from '../../systems/construction/scaffoldRoute';

const BUILDER_ARRIVE_DISTANCE = 0.25;
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { NPC_WALK_SPEED, NPC_APPROACH_SPEED, NPC_HAUL_SPEED } from '../../data/tuning';
import { VOXEL_SIZE, CHUNK_SIZE_Y } from '../../systems/chunks/coordinates';
import { isSolid } from '../../systems/chunks/blockTypes';
import NPCThoughtBubble from './NPCThoughtBubble';
import { applyBonePose } from './voxelRig';
import { createHumanoidInstance, getSettlerLook, SETTLER_UNIT } from './characters/humanoidModel';
import { createHumanoidAnimState, stepHumanoidAnimation } from './characters/humanoidAnimation';

// Pre-allocated vectors
const _targetVec = new THREE.Vector3();
const _currentVec = new THREE.Vector3();
const _dirVec = new THREE.Vector3();

// Status gem floating above the settler's head
const statusGeo = new THREE.OctahedronGeometry(0.16, 0);
const STATUS_GEM_HEIGHT = 2.95;

/**
 * Which looping animation a settler plays in its current state. Work
 * animations only play on site (not while walking there), except carrying.
 */
export function getSettlerActivity(npc, moving) {
  if ((npc.state === 'WORKING_HAUL' && npc.carryingItem) || npc.state === 'HAULING') return 'carry';
  if (moving) return null;
  switch (npc.state) {
    case 'WORKING_MINE': return 'mine';
    case 'WORKING_BUILD':
    case 'BUILDING': return 'build';
    case 'WORKING_FARM': return 'farm';
    case 'EATING': return 'eat';
    case 'SOCIALIZING': return 'wave';
    default: return null;
  }
}

// Status colors
const STATUS_COLORS = {
  APPROACHING: '#ff8800',
  IDLE: '#44cc44',
  WANDERING: '#44cc44',
  EATING: '#ffcc00',
  SLEEPING: '#8844cc',
  WORKING: '#4488ff',
  HAULING: '#4488ff',
  BUILDING: '#ff8844',
  WORKING_MINE: '#ff8c00',
  WORKING_HAUL: '#ffcc00',
  WORKING_BUILD: '#4488ff',
  WORKING_FARM: '#44cc44',
  EVALUATING: '#00ccff',
  SOCIALIZING: '#ff88ff',
  LEAVING: '#ff4444',
};

function getTerrainY(chunkManager, wx, wz) {
  if (!chunkManager) return null;
  for (let vy = CHUNK_SIZE_Y - 1; vy >= 0; vy--) {
    const worldY = vy * VOXEL_SIZE + VOXEL_SIZE / 2;
    const block = chunkManager.getBlock(wx, worldY, wz);
    if (isSolid(block)) {
      return (vy + 1) * VOXEL_SIZE;
    }
  }
  return 2; // fallback
}

const SettlerNPC = React.memo(({ npcData }) => {
  const bodyRef = useRef();
  const statusRef = useRef();
  const lastTerrainCheck = useRef(0);
  const terrainY = useRef(npcData.position[1]);
  const onScaffold = useRef(false);
  const evalRotation = useRef(0);
  const npcIndexRef = useRef(0);

  // Voxel villager dressed for their job; one skinned mesh per settler
  const rig = useMemo(
    () => createHumanoidInstance(getSettlerLook(npcData), { unit: SETTLER_UNIT }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [npcData.id, npcData.appearance, npcData.preferredJob]
  );
  const animRef = useRef(null);
  if (!animRef.current) animRef.current = createHumanoidAnimState((npcData.id?.length || 3) * 0.137 % 1);
  const statusMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: '#44cc44' }), []);

  useEffect(() => () => {
    rig.dispose();
    statusMaterial.dispose();
  }, [rig, statusMaterial]);

  useFrame((_, delta) => {
    if (!bodyRef.current) return;

    const store = useGameStore.getState();
    if (store.gameState === 'paused') return;
    // Fast path: check cached index first, fall back to find()
    const npcs = store.settlement.npcs;
    let npc = npcs[npcIndexRef.current];
    if (!npc || npc.id !== npcData.id) {
      const idx = npcs.findIndex((n) => n.id === npcData.id);
      if (idx === -1) return;
      npcIndexRef.current = idx;
      npc = npcs[idx];
    }

    const rb = bodyRef.current;
    const pos = rb.translation();

    // Terrain Y clamping (check every 500ms, max 1-block step)
    const now = Date.now();
    if (!onScaffold.current && now - lastTerrainCheck.current > 500) {
      lastTerrainCheck.current = now;
      const chunkMgr = store._chunkManager;
      if (chunkMgr) {
        const ty = getTerrainY(chunkMgr, pos.x, pos.z);
        if (ty !== null) {
          const diff = ty - terrainY.current;
          // Allow stepping down freely, but limit step-up to 1 block (VOXEL_SIZE)
          if (diff <= VOXEL_SIZE) {
            terrainY.current = ty;
          }
          // If too steep upward, don't update — NPC stays at current height
        }
      }
    }

    let moving = false;
    let moveSpeed = 0;

    // This component moves the NPC toward targetPosition and performs the
    // on-arrival transitions below (APPROACHING→EVALUATING, WANDERING/SOCIALIZING→IDLE).
    // Everything else (needs, work, timeouts, removal) is NPCStateMachine.tickNPC().

    if (npc.targetPosition) {
      // Move toward target
      _targetVec.set(npc.targetPosition[0], 0, npc.targetPosition[2]);
      _currentVec.set(pos.x, 0, pos.z);
      const dist = _currentVec.distanceTo(_targetVec);

      // Builders walk exact routes round a site (ramp corners, a spot beside
      // the wall), so they need to really get there; everyone else is close enough
      const arriveDist = npc.state === 'WORKING_BUILD' ? BUILDER_ARRIVE_DISTANCE : 1.5;
      if (dist < arriveDist) {
        // Arrived at target
        if (npc.state === 'APPROACHING' && (npc.stateTimer || 0) <= 60) {
          // Transition to EVALUATING (skip if the state machine already timed out to LEAVING)
          store.updateSettlementNPC(npc.id, {
            targetPosition: null,
            arrivedAtSettlement: true,
            state: 'EVALUATING',
            stateTimer: 0,
          });
        } else if (npc.state === 'WANDERING' || npc.state === 'SOCIALIZING') {
          store.updateSettlementNPC(npc.id, {
            targetPosition: null,
            arrivedAtSettlement: true,
            state: 'IDLE',
            stateTimer: npc.state === 'WANDERING' ? 0 : npc.stateTimer,
          });
        }
        // Work states: don't clear targetPosition here — NPCWorkBehavior handles arrival
      } else {
        // Determine speed based on state
        let speed = NPC_WALK_SPEED;
        if (npc.state === 'APPROACHING' || npc.state === 'LEAVING') {
          speed = NPC_APPROACH_SPEED;
        } else if (npc.state === 'HAULING' || (npc.state === 'WORKING_HAUL' && npc.carryingItem)) {
          speed = NPC_HAUL_SPEED;
        }

        _dirVec.subVectors(_targetVec, _currentVec).normalize();
        const step = Math.min(speed * delta, dist); // never overshoot the target

        const newX = pos.x + _dirVec.x * step;
        const newZ = pos.z + _dirVec.z * step;

        // On a construction scaffold ramp: follow its height (only a walkway
        // at the settler's feet counts, so walking beneath one does nothing)
        const scaffoldY = scaffoldHeightAt(
          getActiveScaffoldRoutes(store.constructionSites), newX, newZ, terrainY.current, 0.8
        );
        onScaffold.current = scaffoldY !== null;
        if (onScaffold.current) terrainY.current = scaffoldY;

        // Check for solid blocks at feet and torso height before moving
        const chunkMgr = store._chunkManager;
        let blocked = false;
        let stepUp = false;
        if (chunkMgr && !onScaffold.current) {
          const feetY = terrainY.current + VOXEL_SIZE / 2;
          const torsoY = terrainY.current + VOXEL_SIZE + VOXEL_SIZE / 2;
          const feetSolid = isSolid(chunkMgr.getBlock(newX, feetY, newZ));
          const torsoSolid = isSolid(chunkMgr.getBlock(newX, torsoY, newZ));

          if (feetSolid && !torsoSolid) {
            // 1-block obstacle — check if headroom is clear above the step
            const aboveStepY = terrainY.current + VOXEL_SIZE * 2 + VOXEL_SIZE / 2;
            if (!isSolid(chunkMgr.getBlock(newX, aboveStepY, newZ))) {
              stepUp = true; // auto-step up
            } else {
              blocked = true;
            }
          } else if (torsoSolid) {
            blocked = true; // 2+ block wall, can't pass
          }
        }

        if (!blocked) {
          moving = true;
          moveSpeed = speed;
          const moveY = stepUp ? terrainY.current + VOXEL_SIZE : terrainY.current;
          if (stepUp) terrainY.current = moveY;

          rb.setNextKinematicTranslation({
            x: newX,
            y: moveY,
            z: newZ,
          });

          // Update facing
          const angle = Math.atan2(_dirVec.x, _dirVec.z);
          store.updateSettlementNPC(npc.id, {
            position: [newX, moveY, newZ],
            facingAngle: angle,
          });
        }
      }
    } else {
      // Clamp to terrain when stationary
      rb.setNextKinematicTranslation({ x: pos.x, y: terrainY.current, z: pos.z });

      // Sync position back
      if (Math.abs(pos.y - terrainY.current) > 0.5) {
        store.updateSettlementNPC(npc.id, {
          position: [pos.x, terrainY.current, pos.z],
        });
      }
    }

    // EVALUATING: slow look-around rotation
    const model = rig.mesh;
    if (npc.state === 'EVALUATING') {
      evalRotation.current += delta * 1.2;
      model.rotation.y = Math.sin(evalRotation.current) * 1.0;
    } else {
      // Reset to facing angle
      model.rotation.y = npc.facingAngle || 0;
      evalRotation.current = 0;
    }

    // ── Animations ──
    const pose = stepHumanoidAnimation(animRef.current, {
      speed: moveSpeed,
      activity: getSettlerActivity(npc, moving),
      alert: npc.state === 'EVALUATING',
    }, delta);
    applyBonePose(rig, pose);

    // The status gem bobs and turns gently
    if (statusRef.current?.position) {
      statusRef.current.position.y = STATUS_GEM_HEIGHT + Math.sin(animRef.current.time * 2) * 0.06;
      statusRef.current.rotation.y += delta * 1.5;
    }

    // Sleeping visual — lay NPC on side once it has reached its bed
    if (npc.state === 'SLEEPING' && !moving) {
      model.rotation.z = Math.PI / 2;
    } else if (npc.state !== 'EVALUATING') {
      model.rotation.z = 0;
    }

    // Update status color
    const stateColor = STATUS_COLORS[npc.state] || '#44cc44';
    statusMaterial.color.set(stateColor);
  });

  // Determine thought bubble type from current npc data
  const thoughtType = npcData.thoughtBubble?.type || null;

  return (
    <RigidBody
      ref={bodyRef}
      position={npcData.position}
      type="kinematicPosition"
      colliders={false}
      userData={{ isNPC: true, npcId: npcData.id }}
    >
      <CapsuleCollider args={[0.6, 0.35]} position={[0, 1.2, 0]} />
      <primitive object={rig.mesh} rotation={[0, npcData.facingAngle || 0, 0]} dispose={null} />

      {/* State gem above the head */}
      <mesh ref={statusRef} geometry={statusGeo} material={statusMaterial} position={[0, STATUS_GEM_HEIGHT, 0]} />

      {/* Thought bubble */}
      <NPCThoughtBubble type={thoughtType} />
    </RigidBody>
  );
});

SettlerNPC.displayName = 'SettlerNPC';

export default SettlerNPC;
