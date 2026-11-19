/**
 * Companion.jsx — the companion that follows the player, on the same voxel
 * rigs as everyone else: a robed mage, a helmeted mercenary or a gatherer in
 * a straw hat (humanoidModel), or a wolf pet and a deer mount (animalModels).
 * Above it, a small pixel plaque: a health bar, a state block and a bond
 * block that grows with the bond.
 *
 * Only `active` and `type` are subscribed to; the position (written every
 * frame by CompanionController) is read inside useFrame.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import useGameStore from '../../stores/useGameStore';
import { createHumanoidInstance } from './characters/humanoidModel';
import { createHumanoidAnimState, stepHumanoidAnimation, triggerAction } from './characters/humanoidAnimation';
import { applyBonePose } from './voxelRig';
import { ANIMAL_MODELS, createAnimalInstance } from './wildlife/animalModels';
import { createAnimState, stepAnimation } from './wildlife/animalAnimation';
import { applyAnimalPose } from './WildlifeAnimal';

const BASE_LOOK = {
  skin: '#e8b98f', hair: '#4a3020', hairStyle: 'short', eye: '#2a2420',
  shirt: '#5a5a66', trim: '#c9a85a', pants: '#3e3428', boots: '#3a2a1e', belt: '#5b3a22',
  gloves: null, cape: null, satchel: false, sheathedSword: false, hat: null, beard: false, apron: null,
};

/** Humanoid companions by type. */
export const COMPANION_LOOKS = {
  MAGE: { ...BASE_LOOK, shirt: '#5b3f8a', trim: '#d2ad52', pants: '#3e2c5a', boots: '#2e2438', hair: '#dcdce4', hairStyle: 'long', beard: true, cape: '#33224f' },
  MERCENARY: { ...BASE_LOOK, shirt: '#44506a', trim: '#9aa3ad', jerkin: '#5a4632', hat: 'helmet', sheathedSword: true, gloves: '#4a3a2c', hairStyle: 'short' },
  GATHERER: { ...BASE_LOOK, shirt: '#4f8a4a', trim: '#e3c46b', hat: 'straw', satchel: true, hairStyle: 'ponytail', hair: '#8a5a2a' },
};

/** Animal companions by type (species in animalModels). */
export const COMPANION_ANIMALS = { PET: 'WOLF', MOUNT: 'DEER' };

const STATE_COLORS = {
  IDLE: '#6cbf4a', FOLLOWING: '#6cbf4a', ATTACKING: '#d9473f', DEFENDING: '#5b9ae8',
  GATHERING: '#e8b443', SCOUTING: '#7fe3ff', RESTING: '#8a55d8', DEAD: '#6d717a',
};

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const BAR_W = 0.9;

/** The rig for a companion type: { rig, animal } (animal is the species or null). */
export function createCompanionRig(type) {
  const species = COMPANION_ANIMALS[type];
  if (species) return { rig: createAnimalInstance(species), animal: species };
  return { rig: createHumanoidInstance(COMPANION_LOOKS[type] || COMPANION_LOOKS.MAGE), animal: null };
}

const Companion = React.memo(() => {
  const active = useGameStore((s) => s.companion.active);
  const type = useGameStore((s) => s.companion.type);

  const { rig, animal } = useMemo(() => createCompanionRig(type), [type]);
  useEffect(() => () => rig?.dispose(), [rig]);
  const anim = useRef(null);
  anim.current = anim.current || (animal ? createAnimState(0.4) : createHumanoidAnimState(0.4));
  useEffect(() => {
    anim.current = animal ? createAnimState(0.4) : createHumanoidAnimState(0.4);
  }, [animal]);

  const rootRef = useRef();
  const plaqueRef = useRef();
  const healthRef = useRef();
  const bondRef = useRef();
  const prev = useRef(null);
  const yaw = useRef(0);

  const materials = useMemo(() => ({
    bg: new THREE.MeshBasicMaterial({ color: '#07080b', toneMapped: false }),
    health: new THREE.MeshBasicMaterial({ color: '#6cbf4a', toneMapped: false }),
    state: new THREE.MeshBasicMaterial({ color: '#6cbf4a', toneMapped: false }),
    bond: new THREE.MeshBasicMaterial({ color: '#ff6f9a', toneMapped: false }),
  }), []);
  useEffect(() => () => Object.values(materials).forEach((m) => m.dispose()), [materials]);

  useFrame(({ camera }, delta) => {
    if (!rootRef.current || !rig) return;
    const store = useGameStore.getState();
    if (store.gameState === 'paused') return;
    const c = store.companion;
    const [x, y, z] = c.position;

    // Speed and heading from how far it moved this frame
    const last = prev.current || [x, y, z];
    const dx = x - last[0];
    const dz = z - last[2];
    prev.current = [x, y, z];
    const dist = Math.sqrt(dx * dx + dz * dz);
    const speed = delta > 0 ? Math.min(dist / delta, 8) : 0;
    if (dist > 0.01) yaw.current = Math.atan2(dx, dz);
    rootRef.current.position.set(x, y, z);
    rig.mesh.rotation.y = yaw.current;

    if (animal) {
      applyAnimalPose(rig, stepAnimation(anim.current, ANIMAL_MODELS[animal].anim, { speed, verticalSpeed: 0, fleeing: false }, delta));
    } else {
      const activity = c.state === 'GATHERING' ? 'mine' : null;
      if (c.state === 'ATTACKING' && !anim.current.action) triggerAction(anim.current, 'melee');
      applyBonePose(rig, stepHumanoidAnimation(anim.current, { speed, activity, alert: c.state === 'DEFENDING' }, delta));
    }

    // Plaque: faces the camera, health bar shrinks from the right
    if (plaqueRef.current) plaqueRef.current.quaternion.copy(camera.quaternion);
    const pct = c.maxHealth > 0 ? Math.max(0, Math.min(1, c.health / c.maxHealth)) : 1;
    if (healthRef.current) {
      healthRef.current.scale.x = Math.max(0.001, BAR_W * pct);
      healthRef.current.position.x = -(BAR_W * (1 - pct)) / 2;
    }
    materials.health.color.set(pct > 0.5 ? '#6cbf4a' : pct > 0.25 ? '#e8b443' : '#d9473f');
    materials.state.color.set(STATE_COLORS[c.state] || '#6cbf4a');
    if (bondRef.current) bondRef.current.scale.setScalar(0.1 + (c.bondLevel / 100) * 0.12);
  });

  if (!active || !rig) return null;

  const plaqueY = animal ? 2 : 3.3;
  return (
    <group ref={rootRef}>
      <primitive object={rig.mesh} dispose={null} />
      <group ref={plaqueRef} position={[0, plaqueY, 0]}>
        <mesh geometry={UNIT_BOX} material={materials.bg} scale={[BAR_W + 0.08, 0.16, 0.02]} />
        <mesh ref={healthRef} geometry={UNIT_BOX} material={materials.health} scale={[BAR_W, 0.09, 0.03]} position={[0, 0, 0.01]} />
        <mesh geometry={UNIT_BOX} material={materials.state} scale={[0.12, 0.12, 0.04]} position={[-BAR_W / 2 - 0.16, 0, 0]} />
        <mesh ref={bondRef} geometry={UNIT_BOX} material={materials.bond} scale={[0.1, 0.1, 0.04]} position={[BAR_W / 2 + 0.16, 0, 0]} />
      </group>
    </group>
  );
});

Companion.displayName = 'Companion';

export default Companion;
