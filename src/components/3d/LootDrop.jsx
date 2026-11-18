import React, { useRef, useState, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody } from '@react-three/rapier';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { GoldCoins, MaterialChunk, Potion, PickupShadow, LootModel } from './pickups/pickupModels';

/**
 * LootDrop component - Collectible loot that drops from enemies
 */
const LootDrop = ({ position, lootType, type, amount = 10, material, color, id, onCollect }) => {
  const rigidBodyRef = useRef();
  const groupRef = useRef();
  const [collected, setCollected] = useState(false);
  const timeAlive = useRef(0);

  // Reusable vectors to avoid per-frame allocations
  const _playerPos = useRef(new THREE.Vector3());
  const _lootPos = useRef(new THREE.Vector3());

  const spawnTime = useRef(Date.now());
  const addGold = useGameStore((state) => state.addGold);
  const addMaterial = useGameStore((state) => state.addMaterial);

  // Resolve loot type from either prop name
  const resolvedType = type || lootType || 'gold';

  // Cache color since lootType doesn't change
  const lootColor = useMemo(() => {
    if (color) return color;
    switch (resolvedType) {
      case 'gold': return '#f2c14e';
      case 'health': return '#e5484d';
      case 'mana': return '#4dabf7';
      case 'material': return '#88ff88';
      default: return '#ffffff';
    }
  }, [resolvedType, color]);

  useFrame((state, delta) => {
    if (!rigidBodyRef.current || collected) return;

    // Bobbing + rotation via direct mutation (no state update)
    if (groupRef.current) {
      groupRef.current.position.y = Math.sin(state.clock.elapsedTime * 3) * 0.12;
      groupRef.current.rotation.y = state.clock.elapsedTime * 1.4;
    }

    // Check distance to player for auto-collect
    const lootTranslation = rigidBodyRef.current.translation();
    const playerPosArr = useGameStore.getState().player.position;
    const playerPos = _playerPos.current.set(playerPosArr[0], playerPosArr[1], playerPosArr[2]);
    const lootVec = _lootPos.current.set(lootTranslation.x, lootTranslation.y, lootTranslation.z);
    const distance = playerPos.distanceTo(lootVec);

    // Grace period: don't auto-collect for 1 second after spawning so player sees the drop
    if (distance < 2.5 && Date.now() - spawnTime.current > 1000) {
      setCollected(true);
      if (resolvedType === 'gold') {
        addGold(amount);
        useGameStore.getState().addDamageNumber({
          position: [lootTranslation.x, lootTranslation.y + 1.5, lootTranslation.z],
          damage: `+${amount} gold`,
          color: '#ffd700',
        });
      } else if (resolvedType === 'material' && material) {
        addMaterial(material, amount);
        useGameStore.getState().addDamageNumber({
          position: [lootTranslation.x, lootTranslation.y + 1.5, lootTranslation.z],
          damage: `+${amount} ${material}`,
          color: '#ffffff',
        });
      }
      if (onCollect && id) {
        onCollect(id);
      }
      return;
    }

    // Remove after 60 seconds
    timeAlive.current += delta;
    if (timeAlive.current > 60) {
      setCollected(true);
      if (onCollect && id) {
        onCollect(id);
      }
    }
  });

  if (collected) return null;

  return (
    <RigidBody
      ref={rigidBodyRef}
      position={position}
      type="fixed"
      sensor={true}
      colliders="ball"
    >
      <group ref={groupRef}>
        {resolvedType === 'gold' && <GoldCoins />}
        {resolvedType === 'material' && <LootModel material={material} />}
        {(resolvedType === 'health' || resolvedType === 'mana') && <Potion color={lootColor} />}
        {!['gold', 'material', 'health', 'mana'].includes(resolvedType) && <MaterialChunk color={lootColor} />}
      </group>
      <PickupShadow />
    </RigidBody>
  );
};

export default LootDrop;
