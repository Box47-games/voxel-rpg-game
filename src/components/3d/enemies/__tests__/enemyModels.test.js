/**
 * Rift monster voxel models.
 */
import * as THREE from 'three';
import {
  ENEMY_MODELS,
  createEnemyInstance,
  getEnemyColliderBox,
  getEnemyHeight,
  getEnemyModel,
} from '../enemyModels';
import { MONSTER_TYPES } from '../../../../systems/survival/RiftManager';
import { buildRigGeometry, getModelBounds, getModelParts } from '../../voxelRig';

const TYPES = Object.keys(MONSTER_TYPES);

describe('enemy models', () => {
  test('every rift monster type has a model', () => {
    expect(Object.keys(ENEMY_MODELS).sort()).toEqual([...TYPES].sort());
  });

  test.each(TYPES)('%s is well formed and stands on the ground', (type) => {
    const model = ENEMY_MODELS[type];
    for (const [bone, color] of model.parts) {
      expect(model.bones[bone]).toBeDefined();
      expect(model.colors[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const bone of model.hitboxBones) expect(model.bones[bone]).toBeDefined();
    expect(getModelBounds(model).min[1]).toBeCloseTo(0, 5);
  });

  test('sizes read well next to the player (2.8 tall)', () => {
    expect(getEnemyHeight('slime')).toBeLessThan(1.5);
    expect(getEnemyHeight('goblin')).toBeLessThan(getEnemyHeight('skeleton'));
    expect(getEnemyHeight('skeleton')).toBeLessThan(2.8);
    expect(getModelBounds(ENEMY_MODELS.shadow).size[0]).toBeGreaterThan(1.5); // splayed legs
  });

  test('glowing eyes go into a separate unlit geometry', () => {
    for (const type of ['goblin', 'skeleton', 'shadow']) {
      const model = ENEMY_MODELS[type];
      const { geometry, glowGeometry } = buildRigGeometry(model);
      const glowParts = getModelParts(model).filter(([, , , , o]) => o?.glow).length;
      expect(glowGeometry.attributes.position.count).toBe(glowParts * 24);
      expect(geometry.attributes.position.count).toBe((model.parts.length - glowParts) * 24);
    }
    expect(buildRigGeometry(ENEMY_MODELS.slime).glowGeometry).toBeNull();
  });

  test('colliders hug the body, leaving out weapons and splayed legs', () => {
    const goblin = getEnemyColliderBox('goblin');
    const club = getModelBounds(ENEMY_MODELS.goblin).max[2];
    expect(goblin.center[2] + goblin.halfExtents[2]).toBeLessThan(club);
    const creeper = getEnemyColliderBox('shadow');
    expect(creeper.halfExtents[0] * 2).toBeLessThan(getModelBounds(ENEMY_MODELS.shadow).size[0] / 2);
    expect(goblin.center[1]).toBeCloseTo(goblin.halfExtents[1], 5); // bottom at the feet
  });

  test('unknown types fall back to the slime', () => {
    expect(getEnemyModel('orc')).toBe(ENEMY_MODELS.slime);
    expect(createEnemyInstance('orc').mesh.geometry).toBe(createEnemyInstance('slime').mesh.geometry);
  });
});

describe('createEnemyInstance', () => {
  test('a skeleton with glowing eyes shares one skeleton between both meshes', () => {
    const rig = createEnemyInstance('skeleton', { tint: 0.95 });
    expect(rig.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(rig.glowMesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(rig.glowMesh.skeleton).toBe(rig.mesh.skeleton);
    expect(rig.glowMesh.parent).toBe(rig.mesh);
    expect(rig.glowMaterial).toBeInstanceOf(THREE.MeshBasicMaterial);
    expect(Object.keys(rig.bones).sort()).toEqual(['armL', 'armR', 'body', 'head', 'legL', 'legR']);
    // The weapon arm hangs from the body
    expect(rig.bones.armR.parent).toBe(rig.bones.body);
    rig.dispose();
  });

  test('instances of a type share geometry but not skeletons or materials', () => {
    const a = createEnemyInstance('goblin');
    const b = createEnemyInstance('goblin');
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.mesh.skeleton).not.toBe(b.mesh.skeleton);
    expect(a.material).not.toBe(b.material); // hit flashes are per monster
  });

  test('slimes are glossy', () => {
    expect(createEnemyInstance('slime').material.roughness).toBeLessThan(0.5);
    expect(createEnemyInstance('goblin').material.roughness).toBeGreaterThan(0.5);
  });
});
