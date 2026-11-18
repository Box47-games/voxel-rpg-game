import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { WILDLIFE_TYPES } from '../../data/wildlifeTypes';
import {
  WILDLIFE_WANDER_RADIUS,
  WILDLIFE_WANDER_INTERVAL_MIN,
  WILDLIFE_WANDER_INTERVAL_MAX,
} from '../../data/tuning';
import { VOXEL_SIZE } from '../../systems/chunks/coordinates';
import {
  ANIMAL_MODELS,
  createAnimalInstance,
  getAnimalTraits,
  getColliderBox,
} from './wildlife/animalModels';
import { createAnimState, stepAnimation } from './wildlife/animalAnimation';
import { PathFollower, stepAhead, levelAt } from '../../systems/navigation/gridPath';
import { NAV_HOP_VELOCITY } from '../../data/tuning';

const _playerVec = new THREE.Vector3();
const _animalVec = new THREE.Vector3();
const _moveDir = new THREE.Vector3();

const TURN_RATE = 8; // how quickly an animal turns to face where it's going
const WANDER_GIVE_UP_SECONDS = 20; // can't get to a wander spot by then: pick another later

/** Shortest signed angle from a to b. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/** Apply a pose from stepAnimation() to an animal's bones. */
function applyPose(rig, pose) {
  const { bones, rest } = rig;
  bones.body.position.y = rest.body.y + pose.bodyLift;
  bones.body.rotation.set(pose.bodyPitch, 0, pose.bodyRoll);
  bones.head.rotation.set(pose.headPitch, pose.headYaw, 0);
  bones.tail.rotation.set(pose.tailPitch, pose.tailYaw, 0);
  bones.legFL.rotation.x = pose.legs.FL;
  bones.legFR.rotation.x = pose.legs.FR;
  bones.legBL.rotation.x = pose.legs.BL;
  bones.legBR.rotation.x = pose.legs.BR;
  bones.wingL.rotation.z = pose.wingLift; // +X wing: positive Z lifts the tip
  bones.wingR.rotation.z = -pose.wingLift;
}

const WildlifeAnimal = React.memo(({ animalData, chunkManager }) => {
  const bodyRef = useRef();
  const stateRef = useRef('IDLE');
  const wanderTimerRef = useRef(Math.random() * WILDLIFE_WANDER_INTERVAL_MAX);
  const targetRef = useRef(null);
  const followerRef = useRef(null); // path to the wander target
  const lastHopRef = useRef(-1);
  const wanderStartRef = useRef(0);
  const rotationRef = useRef(0);
  const yawRef = useRef(0);
  const flyPhase = useRef(Math.random() * Math.PI * 2);

  const typeDef = WILDLIFE_TYPES[animalData.type];
  const model = ANIMAL_MODELS[animalData.type];

  // Each animal gets its own skeleton (shared geometry) and a little variety
  const traits = useMemo(() => getAnimalTraits(animalData.id, animalData.type), [animalData.id, animalData.type]);
  const rig = useMemo(
    () => (typeDef && model ? createAnimalInstance(animalData.type, traits) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [animalData.type, traits]
  );
  useEffect(() => () => rig?.dispose(), [rig]);
  const animRef = useRef(null);
  if (!animRef.current) animRef.current = createAnimState(traits.seed);

  const collider = useMemo(() => (model ? getColliderBox(model) : null), [model]);

  useFrame((state, delta) => {
    if (!bodyRef.current || !rig) return;
    const store = useGameStore.getState();
    if (store.gameState === 'paused') return;
    const body = bodyRef.current;
    const pos = body.translation();

    const playerPos = store.player.position;
    if (!playerPos) return;
    const now = state.clock.elapsedTime;
    // Upward speed this frame: a hop over a one-block step just ahead, else unchanged
    const hopY = (dx, dz, t) => {
      const vy = body.linvel().y;
      if (!typeDef.ground || !chunkManager || Math.abs(vy) > 0.6 || t - lastHopRef.current < 0.5) return vy;
      if (!stepAhead(chunkManager, [pos.x, pos.y, pos.z], dx, dz, 0.8)) return vy;
      lastHopRef.current = t;
      return NAV_HOP_VELOCITY;
    };

    _playerVec.set(playerPos[0], playerPos[1], playerPos[2]);
    _animalVec.set(pos.x, pos.y, pos.z);
    const distToPlayer = _playerVec.distanceTo(_animalVec);

    // Flee check (prey animals)
    if (typeDef.fleeRange > 0 && distToPlayer < typeDef.fleeRange) {
      stateRef.current = 'FLEEING';
      _moveDir.set(pos.x - playerPos[0], 0, pos.z - playerPos[2]).normalize();
      const fleeSpeed = typeDef.speed * 1.5;
      body.setLinvel(
        { x: _moveDir.x * fleeSpeed, y: hopY(_moveDir.x, _moveDir.z, now), z: _moveDir.z * fleeSpeed },
        true
      );
      rotationRef.current = Math.atan2(_moveDir.x, _moveDir.z);
    } else if (stateRef.current === 'FLEEING') {
      stateRef.current = 'IDLE';
      wanderTimerRef.current = WILDLIFE_WANDER_INTERVAL_MIN;
    }

    if (stateRef.current === 'IDLE') {
      const vel = body.linvel();
      body.setLinvel({ x: vel.x * 0.85, y: vel.y, z: vel.z * 0.85 }, true);

      wanderTimerRef.current -= delta;
      if (wanderTimerRef.current <= 0) {
        const sx = animalData.spawnPosition[0];
        const sz = animalData.spawnPosition[2];
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * WILDLIFE_WANDER_RADIUS;
        targetRef.current = [sx + Math.cos(angle) * r, sz + Math.sin(angle) * r];
        stateRef.current = 'WANDERING';
        wanderStartRef.current = now;
      }
    }

    if (stateRef.current === 'WANDERING' && targetRef.current) {
      const [gx, gz] = targetRef.current;
      const gdist = Math.hypot(gx - pos.x, gz - pos.z);
      // Ground animals walk a path round obstacles; birds fly straight
      let [tx, tz] = [gx, gz];
      if (typeDef.ground && chunkManager) {
        if (!followerRef.current) followerRef.current = new PathFollower({ stuckSeconds: 2 });
        followerRef.current.setGoal([gx, pos.y, gz]);
        const p = followerRef.current.next(chunkManager, [pos.x, pos.y, pos.z], now);
        if (p) [tx, , tz] = p;
      }
      const dx = tx - pos.x;
      const dz = tz - pos.z;
      const dist = Math.max(0.001, Math.sqrt(dx * dx + dz * dz));

      // Arrived, or given up on a spot it can't reach: rest a while
      if (gdist < 1.5 || now - wanderStartRef.current > WANDER_GIVE_UP_SECONDS) {
        stateRef.current = 'IDLE';
        wanderTimerRef.current =
          WILDLIFE_WANDER_INTERVAL_MIN +
          Math.random() * (WILDLIFE_WANDER_INTERVAL_MAX - WILDLIFE_WANDER_INTERVAL_MIN);
        targetRef.current = null;
        const vel = body.linvel();
        body.setLinvel({ x: vel.x * 0.5, y: vel.y, z: vel.z * 0.5 }, true);
      } else {
        const nx = dx / dist;
        const nz = dz / dist;
        body.setLinvel(
          { x: nx * typeDef.speed, y: hopY(nx, nz, now), z: nz * typeDef.speed },
          true
        );
        rotationRef.current = Math.atan2(nx, nz);
      }
    }

    // Ground clamping: only pull an animal that has sunk into the ground back
    // up onto the floor it stands on (not the top of the column, which under a
    // tree is the canopy). Falling and hopping are left to physics.
    if (typeDef.ground && chunkManager) {
      const level = levelAt(chunkManager, pos.x, pos.y, pos.z);
      if (level != null) {
        const floorY = level * VOXEL_SIZE; // the body's origin is at the animal's feet
        if (pos.y < floorY - 1) {
          body.setTranslation({ x: pos.x, y: floorY, z: pos.z }, true);
          body.setLinvel({ x: body.linvel().x, y: 0, z: body.linvel().z }, true);
        }
      }
    }

    // Flying animals: vertical oscillation
    if (!typeDef.ground) {
      flyPhase.current += delta * 0.8;
      const baseAlt = animalData.spawnPosition[1];
      const oscY = Math.sin(flyPhase.current) * 2;
      const targetY = baseAlt + oscY;
      const vel = body.linvel();
      const yDiff = targetY - pos.y;
      body.setLinvel({ x: vel.x, y: yDiff * 2, z: vel.z }, true);
    }

    // Update position on the data object directly (avoids store churn)
    animalData.position[0] = pos.x;
    animalData.position[1] = pos.y;
    animalData.position[2] = pos.z;

    // Turn smoothly toward the heading
    yawRef.current += angleDelta(yawRef.current, rotationRef.current) * Math.min(1, delta * TURN_RATE);
    rig.mesh.rotation.y = yawRef.current;

    // Animate legs, head, tail and wings from how fast the body is moving
    const vel = body.linvel();
    const pose = stepAnimation(animRef.current, model.anim, {
      speed: Math.sqrt(vel.x * vel.x + vel.z * vel.z) / traits.scale,
      verticalSpeed: vel.y,
      fleeing: stateRef.current === 'FLEEING',
    }, delta);
    applyPose(rig, pose);
  });

  if (!typeDef || !rig) return null;

  const s = traits.scale;
  return (
    <RigidBody
      ref={bodyRef}
      position={animalData.position}
      enabledRotations={[false, false, false]}
      type="dynamic"
      colliders={false}
      mass={0.3}
      linearDamping={0.5}
      gravityScale={typeDef.ground ? 1 : 0}
    >
      <CuboidCollider
        args={collider.halfExtents.map((v) => v * s)}
        position={collider.center.map((v) => v * s)}
      />
      {/* One skinned mesh per animal: a single draw call, posed by its bones */}
      <primitive object={rig.mesh} scale={s} dispose={null} />
    </RigidBody>
  );
});

WildlifeAnimal.displayName = 'WildlifeAnimal';

export default WildlifeAnimal;
