import React, { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { XPShard } from './pickups/pickupModels';

/**
 * XPOrb component - Collectible XP that flies toward player
 */
const XPOrb = ({ position, xpAmount = 25, id, onCollect }) => {
  const rigidBodyRef = useRef();
  const shardRef = useRef();
  const [collected, setCollected] = React.useState(false);

  // Reusable vectors to avoid per-frame allocations
  const _playerPos = useRef(new THREE.Vector3());
  const _orbPos = useRef(new THREE.Vector3());
  const _direction = useRef(new THREE.Vector3());


  useFrame((state) => {
    if (!rigidBodyRef.current || collected) return;
    if (shardRef.current) {
      const t = state.clock.elapsedTime;
      shardRef.current.rotation.y = t * 3;
      const pulse = 1 + Math.sin(t * 6) * 0.12;
      shardRef.current.scale.setScalar(pulse);
    }

    const orbTranslation = rigidBodyRef.current.translation();
    const playerPosArr = useGameStore.getState().player.position;
    const playerPos = _playerPos.current.set(playerPosArr[0], playerPosArr[1], playerPosArr[2]);
    const orbVec = _orbPos.current.set(orbTranslation.x, orbTranslation.y, orbTranslation.z);

    // Calculate distance to player
    const distance = playerPos.distanceTo(orbVec);

    // Always track toward player - speed increases as orb gets closer
    const direction = _direction.current.subVectors(playerPos, orbVec).normalize();

    // Base speed when far, accelerates when close
    let speed;
    if (distance > 15) {
      speed = 3;
    } else if (distance > 5) {
      speed = 5 + (15 - distance) * 0.5;
    } else {
      speed = 10 + (5 - distance) * 3;
    }

    direction.multiplyScalar(speed);

    rigidBodyRef.current.setLinvel({
      x: direction.x,
      y: direction.y,
      z: direction.z,
    }, true);

    // Collect when very close
    if (distance < 1.5) {
      setCollected(true);
      useGameStore.getState().addXP(xpAmount);
      if (onCollect) onCollect(id);
    }
  });

  if (collected) return null;

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={position}
      type="dynamic"
      sensor={true}
      colliders="ball"
      gravityScale={0}
    >
      <group ref={shardRef}>
        <XPShard />
      </group>
    </RigidBody>
  );
};

export default XPOrb;
