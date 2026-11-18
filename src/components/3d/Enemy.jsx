import React, { useRef, useState, useCallback, useEffect, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { audioManager } from '../../utils/AudioManager';
import { getQuestManager } from '../../systems/QuestManager';
// NOTE: Billboard and Text from drei removed - they caused WebGL shader errors
// that corrupted the rendering pipeline, preventing terrain chunks from drawing.
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { VOXEL_SIZE, CHUNK_SIZE_Y } from '../../systems/chunks/coordinates';
import { isSolid } from '../../systems/chunks/blockTypes';
import { PathFollower, stepAhead, headingTo } from '../../systems/navigation/gridPath';
import { NAV_HOP_VELOCITY } from '../../data/tuning';
import {
  STATUS_TICK_INTERVAL,
  STATUS_FREEZE_SLOW,
  STATUS_SLOW_MULT,
  STATUS_BURN_DAMAGE_TAKEN_MULT,
  RIFT_ANCHOR_ATTACK_RANGE,
} from '../../data/tuning';
import { applyBonePose, hashString, hash01 } from './voxelRig';
import {
  createEnemyInstance,
  getEnemyModel,
  getEnemyColliderBox,
  getEnemyHeight,
} from './enemies/enemyModels';
import {
  createEnemyAnimState,
  stepEnemyAnimation,
  stepDeath,
  triggerAttack,
  triggerHurt,
  DEATH_DURATION,
} from './enemies/enemyAnimation';

const TURN_RATE = 10; // how quickly a monster turns to face its target
const HITBOX_PADDING = 1.25; // invisible click/tap target is a bit larger than the body

// Emissive tints while a status effect is active
const STATUS_TINTS = {
  freeze: [0.15, 0.35, 0.6],
  slow: [0.1, 0.2, 0.4],
  burn: [0.6, 0.25, 0.0],
  poison: [0.1, 0.45, 0.1],
  stun: [0.45, 0.45, 0.15],
};

/** Shortest signed angle from a to b. */
function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Set the body's glow: a white flash when hit, tinted by active status
 * effects (burn flickers).
 */
function updateEmissive(material, flash, effects, time) {
  let r = 0;
  let g = 0;
  let b = 0;
  for (const e of effects) {
    const tint = STATUS_TINTS[e.type];
    if (!tint) continue;
    const k = e.type === 'burn' ? 0.7 + Math.sin(time * 18) * 0.3 : 1;
    r = Math.max(r, tint[0] * k);
    g = Math.max(g, tint[1] * k);
    b = Math.max(b, tint[2] * k);
  }
  material.emissive.setRGB(Math.max(r, flash), Math.max(g, flash), Math.max(b, flash * 0.9));
}

/** True while the rift a reinforcement was sent to is still being closed. */
function isAnchorActive(rifts, riftId) {
  if (!riftId) return false;
  for (const r of rifts) {
    if (r.id === riftId) return r.state === 'CLOSING';
  }
  return false;
}

/** Movement multiplier from active crowd-control effects. */
function getStatusSpeedMultiplier(effects) {
  let mult = 1;
  for (const e of effects) {
    if (e.type === 'stun') return 0;
    if (e.type === 'freeze') mult *= STATUS_FREEZE_SLOW;
    else if (e.type === 'slow') mult *= STATUS_SLOW_MULT;
  }
  return mult;
}

/**
 * Enemy component - Basic hostile mob with AI
 */
// Material drops by monster type
const MONSTER_DROPS = {
  slime: [{ material: 'fiber', amount: 1, chance: 0.5 }],
  goblin: [{ material: 'leather', amount: 1, chance: 0.6 }, { material: 'bone', amount: 1, chance: 0.3 }],
  skeleton: [{ material: 'bone', amount: 2, chance: 0.8 }],
  shadow: [{ material: 'crystal', amount: 1, chance: 0.4 }],
};

const Enemy = ({ position = [0, 2, 0], type = 'slime', name = 'Slime', monsterData = null }) => {
  const enemyRef = useRef();
  const [health, setHealth] = useState(monsterData?.health || 50);
  const [isAlive, setIsAlive] = useState(true);
  const isDead = useRef(false); // Immediate flag to prevent multi-frame death
  const deathPosition = useRef(null); // Capture actual death position
  const attackCooldownRef = useRef(0); // Ref to avoid per-frame re-renders
  const hitFlashRef = useRef(0); // 1 when just hit, fades to 0
  const followerRef = useRef(null); // path to the player / anchor
  const lastHopRef = useRef(-1);

  const mDamage = monsterData?.damage || 5;
  const mSpeed = monsterData?.speed || 2;
  const mColor = monsterData?.color || '#ff4444';
  const mXp = monsterData?.xp || 25;
  const mName = monsterData?.name || name;
  const mType = monsterData?.type || type;

  // Voxel model: own skeleton over shared geometry, slight per-monster shade
  const seed = useMemo(() => hash01(hashString(monsterData?.id || mType), 7), [monsterData?.id, mType]);
  const rig = useMemo(() => createEnemyInstance(mType, { tint: 0.92 + seed * 0.12 }), [mType, seed]);
  useEffect(() => () => rig.dispose(), [rig]);
  const animSpec = getEnemyModel(mType).anim;
  const animRef = useRef(null);
  if (!animRef.current) animRef.current = createEnemyAnimState(seed);
  const yawRef = useRef(seed * Math.PI * 2);
  const deathTimeRef = useRef(0);
  const collider = useMemo(() => getEnemyColliderBox(mType), [mType]);
  const modelHeight = useMemo(() => getEnemyHeight(mType), [mType]);

  // Reusable Vector3 refs to avoid per-frame allocations
  const _playerPos = useRef(new THREE.Vector3());
  const _enemyPos = useRef(new THREE.Vector3());
  const _direction = useRef(new THREE.Vector3());

  // Active status effects: [{ type, duration, value, tickTimer }]
  const statusEffectsRef = useRef([]);

  // Handle taking damage - useCallback ensures stable reference
  const takeDamage = useCallback((rawDamage) => {
    if (isDead.current) return;
    const burning = statusEffectsRef.current.some((e) => e.type === 'burn');
    const damage = Math.round(burning ? rawDamage * STATUS_BURN_DAMAGE_TAKEN_MULT : rawDamage);
    setHealth((prev) => {
      const newHealth = Math.max(0, prev - damage);
      return newHealth;
    });

    // Flash and recoil
    hitFlashRef.current = 1;
    triggerHurt(animRef.current);

    // Spawn floating damage number and apply knockback
    if (enemyRef.current) {
      const enemyPos = enemyRef.current.translation();
      const store = useGameStore.getState();
      const playerPos = store.player.position;

      // Add damage number
      store.addDamageNumber({
        position: [enemyPos.x, enemyPos.y + modelHeight + 0.3, enemyPos.z],
        damage: damage,
      });

      // Add hit particle burst
      store.addParticleEffect({
        position: [enemyPos.x, enemyPos.y + modelHeight * 0.5, enemyPos.z],
        color: '#ffaa00',
        type: 'burst',
        count: 8,
      });

      // Apply knockback impulse (push away from player)
      const knockbackDir = _direction.current.set(
        enemyPos.x - playerPos[0],
        0.3,
        enemyPos.z - playerPos[2]
      ).normalize();

      const knockbackForce = Math.min(5 + damage * 0.1, 12);
      enemyRef.current.applyImpulse({
        x: knockbackDir.x * knockbackForce,
        y: knockbackDir.y * knockbackForce,
        z: knockbackDir.z * knockbackForce,
      }, true);
    }
  }, [modelHeight]);

  // Apply (or refresh) a status effect such as stun/freeze/poison/burn
  const applyStatusEffect = useCallback((effect) => {
    if (!effect?.type || !effect.duration || isDead.current) return;
    statusEffectsRef.current = [
      ...statusEffectsRef.current.filter((e) => e.type !== effect.type),
      { type: effect.type, duration: effect.duration, value: effect.value || 0, tickTimer: 0 },
    ];
  }, []);

  const enemyId = monsterData?.id;
  const hitUserData = useMemo(
    () => ({ isEnemy: true, id: enemyId, takeDamage, applyStatusEffect }),
    [enemyId, takeDamage, applyStatusEffect]
  );

  // Register hit handlers so melee/AOE/projectile code can damage this enemy by id
  useEffect(() => {
    if (!enemyId) return undefined;
    const handlers = useGameStore.getState()._enemyHandlers;
    handlers.set(enemyId, { takeDamage, applyStatusEffect });
    return () => {
      handlers.delete(enemyId);
      useGameStore.getState()._enemyPositions.delete(enemyId);
    };
  }, [enemyId, takeDamage, applyStatusEffect]);

  // Keep RigidBody userData in sync with the hit handlers
  useEffect(() => {
    if (enemyRef.current) {
      enemyRef.current.userData = hitUserData;
    }
  }, [hitUserData]);

  // Enemy AI behavior
  useFrame((state, delta) => {
    const gameStore = useGameStore.getState();
    // Frozen while paused / not playing (physics is paused too)
    if (gameStore.gameState !== 'playing') return;

    // Death animation: topple / melt / curl up, then fade out
    if (isDead.current) {
      if (isAlive) return; // the corpse mounts on the next render
      deathTimeRef.current += delta;
      const death = stepDeath(animSpec, deathTimeRef.current);
      applyBonePose(rig, death.pose);
      rig.mesh.rotation.set(0, yawRef.current, 0);
      rig.mesh.rotateZ(death.tilt);
      rig.mesh.position.y = -death.sink;
      const opacity = 1 - death.fade;
      for (const mat of [rig.material, rig.glowMaterial]) {
        if (!mat) continue;
        mat.transparent = opacity < 1;
        mat.opacity = opacity;
      }
      rig.mesh.visible = deathTimeRef.current < DEATH_DURATION;
      return;
    }
    if (!enemyRef.current || !isAlive) return;

    const body = enemyRef.current;
    const currentPos = body.translation();

    // Sync live position for spell auto-aim, melee and AOE hit detection
    if (enemyId) {
      gameStore._enemyPositions.set(enemyId, [currentPos.x, currentPos.y, currentPos.z]);
    }

    // ── Status effects: tick durations and damage-over-time ──
    let speedMult = 1;
    if (statusEffectsRef.current.length > 0) {
      const remaining = [];
      for (const effect of statusEffectsRef.current) {
        effect.duration -= delta;
        if ((effect.type === 'poison' || effect.type === 'burn') && effect.value > 0) {
          effect.tickTimer += delta;
          if (effect.tickTimer >= STATUS_TICK_INTERVAL) {
            effect.tickTimer -= STATUS_TICK_INTERVAL;
            setHealth((prev) => Math.max(0, prev - effect.value));
          }
        }
        if (effect.duration > 0) remaining.push(effect);
      }
      statusEffectsRef.current = remaining;
      speedMult = getStatusSpeedMultiplier(remaining);
    }

    // Calculate distance to player (reuse vectors)
    const playerPosArr = gameStore.player.position;
    const playerPos = _playerPos.current.set(playerPosArr[0], playerPosArr[1], playerPosArr[2]);
    const enemyPos = _enemyPos.current.set(currentPos.x, currentPos.y, currentPos.z);
    const distance = playerPos.distanceTo(enemyPos);

    // Terrain clamping — prevent falling through when chunk has no physics collider
    // Only check when clearly falling (fast downward velocity or far below expected terrain)
    const vel = body.linvel();
    if (vel.y < -12 || currentPos.y < -2) {
      const chunkMgr = useGameStore.getState()._chunkManager;
      if (chunkMgr) {
        for (let vy = CHUNK_SIZE_Y - 1; vy >= 0; vy--) {
          const worldY = vy * VOXEL_SIZE + VOXEL_SIZE / 2;
          const block = chunkMgr.getBlock(currentPos.x, worldY, currentPos.z);
          if (isSolid(block)) {
            const surfaceY = (vy + 1) * VOXEL_SIZE + 1;
            if (currentPos.y < surfaceY - 1) {
              body.setTranslation({ x: currentPos.x, y: surfaceY, z: currentPos.z }, true);
              body.setLinvel({ x: vel.x, y: 0, z: vel.z }, true);
            }
            break;
          }
        }
      }
    }

    // Steer along a path to `goal` at `speed`; hop one-block steps in the way
    function walkToward(goal, speed, now) {
      const feet = [currentPos.x, currentPos.y, currentPos.z];
      const cm = gameStore._chunkManager;
      let target = goal;
      if (cm) {
        if (!followerRef.current) followerRef.current = new PathFollower();
        followerRef.current.setGoal(goal);
        target = followerRef.current.next(cm, feet, now) || goal;
      }
      const h = headingTo(feet, target);
      const lv = body.linvel();
      if (!h || speed <= 0) {
        body.setLinvel({ x: 0, y: lv.y, z: 0 }, true);
        return;
      }
      let vy = lv.y;
      const onGround = Math.abs(lv.y) < 0.6;
      if (cm && onGround && now - lastHopRef.current > 0.5 && stepAhead(cm, feet, h[0], h[1])) {
        vy = NAV_HOP_VELOCITY;
        lastHopRef.current = now;
      }
      body.setLinvel({ x: h[0] * speed, y: vy, z: h[1] * speed }, true);
    }

    // AI behaviors
    const detectionRange = 20;
    const attackRange = 2;

    // Reinforcements march on their rift's anchor while it is being closed,
    // unless the player is closer. RiftController applies the anchor damage.
    const anchor = monsterData?.targetPosition;
    let anchorDist = Infinity;
    if (anchor && isAnchorActive(gameStore.rifts, monsterData.targetRiftId)) {
      const adx = anchor[0] - enemyPos.x;
      const adz = anchor[2] - enemyPos.z;
      anchorDist = Math.sqrt(adx * adx + adz * adz);
    }
    const chasingAnchor = anchorDist < distance;

    if (chasingAnchor) {
      // Stop just inside attack range so the anchor check keeps registering hits
      const moveMult = anchorDist > RIFT_ANCHOR_ATTACK_RANGE * 0.5 ? mSpeed * speedMult : 0;
      walkToward([anchor[0], enemyPos.y, anchor[2]], moveMult, state.clock.elapsedTime);
    } else if (distance < detectionRange) {
      // Move towards the player: round walls, hopping one-block steps
      walkToward([playerPos.x, playerPos.y, playerPos.z], mSpeed * speedMult, state.clock.elapsedTime);

      // Attack player if in range
      if (distance < attackRange && speedMult > 0 && gameStore.player.health > 0) {
        if (attackCooldownRef.current <= 0) {
          gameStore.dealDamageToPlayer(mDamage, `Killed by ${mName}`);
          attackCooldownRef.current = 1.0;
          triggerAttack(animRef.current);
        }
      }
    } else {
      // Idle - apply damping to slow down
      const currentVel = body.linvel();
      body.setLinvel(
        {
          x: currentVel.x * 0.9,
          y: currentVel.y,
          z: currentVel.z * 0.9,
        },
        true
      );
    }

    // Face the target (or the way it's moving), then animate
    const moveVel = body.linvel();
    const horizSpeed = Math.sqrt(moveVel.x * moveVel.x + moveVel.z * moveVel.z);
    const alert = chasingAnchor || distance < detectionRange;
    let targetYaw = yawRef.current;
    if (chasingAnchor) targetYaw = Math.atan2(anchor[0] - enemyPos.x, anchor[2] - enemyPos.z);
    else if (alert) targetYaw = Math.atan2(playerPos.x - enemyPos.x, playerPos.z - enemyPos.z);
    else if (horizSpeed > 0.3) targetYaw = Math.atan2(moveVel.x, moveVel.z);
    if (speedMult > 0) {
      yawRef.current += angleDelta(yawRef.current, targetYaw) * Math.min(1, delta * TURN_RATE);
    }
    rig.mesh.rotation.y = yawRef.current;

    const pose = stepEnemyAnimation(animRef.current, animSpec, { speed: horizSpeed, alert }, speedMult > 0 ? delta : 0);
    applyBonePose(rig, pose);
    hitFlashRef.current = Math.max(0, hitFlashRef.current - delta * 4);
    updateEmissive(rig.material, hitFlashRef.current, statusEffectsRef.current, animRef.current.time);

    // Update cooldowns (ref — no re-render)
    if (attackCooldownRef.current > 0) {
      attackCooldownRef.current = Math.max(0, attackCooldownRef.current - delta);
    }

    // Check if dead — use ref for immediate guard (React state is async)
    if (health <= 0 && !isDead.current) {
      isDead.current = true;
      deathPosition.current = [currentPos.x, currentPos.y, currentPos.z];
      setIsAlive(false);
      const store = gameStore;
      statusEffectsRef.current = [];
      if (enemyId) {
        store._enemyPositions.delete(enemyId);
        store._enemyHandlers.delete(enemyId);
      }
      const ePos = body.translation();

      // Spawn XP orb
      store.addXPOrb({
        position: [ePos.x, ePos.y + 1, ePos.z],
        xpAmount: mXp,
      });

      // Spawn gold as loot drop in world
      store.addLootDrop({
        position: [ePos.x, ePos.y + 1, ePos.z],
        type: 'gold',
        amount: 10,
        color: '#ffdd00',
      });

      // Material drops as world loot entities
      const drops = MONSTER_DROPS[mType] || [];
      for (const drop of drops) {
        if (Math.random() < drop.chance) {
          store.addLootDrop({
            position: [ePos.x + (Math.random() - 0.5) * 2, ePos.y + 1, ePos.z + (Math.random() - 0.5) * 2],
            type: 'material',
            material: drop.material,
            amount: drop.amount,
            color: '#88ff88',
          });
        }
      }

      // Spawn death particle effect
      store.addParticleEffect({
        position: [ePos.x, ePos.y + 0.5, ePos.z],
        color: mColor,
        type: 'explosion',
        count: 15,
      });

      // Audio + quest tracking
      audioManager.play('enemyDeath');
      try { getQuestManager().emit('monsterKilled', mType); } catch (_) { /* quest system not ready */ }

      // Remove from rift enemy list after death animation
      if (monsterData?.id) {
        setTimeout(() => {
          useGameStore.getState().removeRiftEnemy(monsterData.id);
        }, 2000);
      }
    }
  });

  if (!isAlive) {
    // The corpse plays its death animation where the monster fell
    const pos = deathPosition.current || position;
    return (
      <group position={pos}>
        <primitive object={rig.mesh} dispose={null} />
      </group>
    );
  }

  const hitbox = collider.halfExtents.map((v) => v * 2 * HITBOX_PADDING);
  return (
    <RigidBody
      ref={enemyRef}
      position={position}
      enabledRotations={[false, false, false]}
      type="dynamic"
      colliders={false}
      mass={0.8}
      linearDamping={0.8}
      userData={hitUserData}
    >
      <CuboidCollider args={collider.halfExtents} position={collider.center} />
      <group userData={hitUserData}>
        {/* Invisible larger hitbox for easier click/tap targeting */}
        <mesh position={collider.center} userData={hitUserData}>
          <boxGeometry args={hitbox} />
          <meshBasicMaterial visible={false} />
        </mesh>
        {/* Voxel model: one skinned mesh (plus one for glowing eyes) */}
        <primitive object={rig.mesh} userData={hitUserData} dispose={null} />
      </group>
    </RigidBody>
  );
};

export default Enemy;
