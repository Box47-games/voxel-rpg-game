/**
 * Wildlife voxel models: every species builds, is skinned to real bones and
 * stands on the ground.
 */
import * as THREE from 'three';
import {
  ANIMAL_MODELS,
  BONE_NAMES,
  buildAnimalGeometry,
  createAnimalInstance,
  getAnimalTraits,
  getColliderBox,
  getModelBounds,
  getModelParts,
} from '../animalModels';
import { WILDLIFE_TYPES } from '../../../../data/wildlifeTypes';

const TYPES = Object.keys(WILDLIFE_TYPES);

describe('animal models', () => {
  test('every wildlife type has a model', () => {
    expect(Object.keys(ANIMAL_MODELS).sort()).toEqual([...TYPES].sort());
  });

  test.each(TYPES)('%s uses only defined bones and colors', (type) => {
    const model = ANIMAL_MODELS[type];
    for (const [bone, color] of model.parts) {
      expect(BONE_NAMES).toContain(bone);
      expect(model.bones[bone]).toBeDefined();
      expect(model.colors[color]).toMatch(/^#[0-9a-f]{6}$/);
    }
    for (const def of Object.values(model.bones)) {
      if (def.parent) expect(model.bones[def.parent]).toBeDefined();
    }
  });

  test.each(TYPES)('%s stands on the ground and has its parts', (type) => {
    const model = ANIMAL_MODELS[type];
    const { min } = getModelBounds(model);
    if (WILDLIFE_TYPES[type].ground) expect(min[1]).toBeCloseTo(0, 5); // feet on y = 0
    else expect(min[1]).toBeGreaterThanOrEqual(0); // flyers sit just above their origin
    expect(model.bones.head).toBeDefined();
    expect(model.bones.body).toBeDefined();
    if (WILDLIFE_TYPES[type].ground) {
      for (const leg of ['legFL', 'legFR', 'legBL', 'legBR']) expect(model.bones[leg]).toBeDefined();
    } else {
      expect(model.bones.wingL).toBeDefined();
      expect(model.bones.wingR).toBeDefined();
    }
  });

  test('species keep sensible sizes next to the player (2.8 tall)', () => {
    const height = (type) => getModelBounds(ANIMAL_MODELS[type]).size[1];
    const length = (type) => getModelBounds(ANIMAL_MODELS[type]).size[2];
    expect(height('BEAR')).toBeGreaterThan(1.6);
    expect(height('DEER')).toBeGreaterThan(height('WOLF'));
    expect(height('DEER')).toBeLessThan(2.8);
    expect(length('BEAR')).toBeGreaterThan(length('WOLF') * 0.8);
    expect(length('MOLE')).toBeLessThan(length('RACCOON'));
    for (const type of TYPES) expect(length(type)).toBeGreaterThan(0.35);
  });

  test('antlers only appear on the antlered variant', () => {
    const deer = ANIMAL_MODELS.DEER;
    expect(getModelParts(deer, 'antlers').length).toBeGreaterThan(getModelParts(deer).length);
    expect(getModelBounds(deer, 'antlers').max[1]).toBeGreaterThan(getModelBounds(deer).max[1]);
  });

  test('the collider leaves out wings and tails', () => {
    const crow = getColliderBox(ANIMAL_MODELS.CROW);
    expect(crow.halfExtents[0] * 2).toBeLessThan(getModelBounds(ANIMAL_MODELS.CROW).size[0] / 2);
    const box = getColliderBox(ANIMAL_MODELS.DEER);
    expect(box.center[1]).toBeCloseTo(box.halfExtents[1], 5); // bottom at the feet
  });
});

describe('buildAnimalGeometry', () => {
  test.each(TYPES)('%s merges into one skinned geometry', (type) => {
    const model = ANIMAL_MODELS[type];
    const geo = buildAnimalGeometry(model);
    const parts = getModelParts(model).length;
    expect(geo.attributes.position.count).toBe(parts * 24);
    expect(geo.index.count).toBe(parts * 36);
    const skin = geo.attributes.skinIndex.array;
    const used = new Set();
    for (let i = 0; i < skin.length; i += 4) used.add(BONE_NAMES[skin[i]]);
    expect([...used].every((b) => model.bones[b])).toBe(true);
    expect(geo.attributes.skinWeight.array[0]).toBe(1);
    // Undersides are darker than tops
    const colors = geo.attributes.color.array;
    const normals = geo.attributes.normal.array;
    let top = null;
    let bottom = null;
    for (let v = 0; v < 24; v++) {
      if (normals[v * 3 + 1] > 0.5) top = colors[v * 3 + 1];
      if (normals[v * 3 + 1] < -0.5) bottom = colors[v * 3 + 1];
    }
    expect(bottom).toBeLessThan(top);
  });
});

describe('createAnimalInstance', () => {
  test('builds a posable skinned mesh', () => {
    const rig = createAnimalInstance('WOLF', { tint: 0.95 });
    expect(rig.mesh).toBeInstanceOf(THREE.SkinnedMesh);
    expect(rig.mesh.skeleton.bones).toHaveLength(BONE_NAMES.length);
    expect(rig.mesh.material.color.r).toBeCloseTo(0.95);
    // Head is a child of the body, legs hang off the mesh root
    expect(rig.bones.head.parent).toBe(rig.bones.body);
    expect(rig.bones.legFL.parent).toBe(rig.mesh);
    const headWorld = new THREE.Vector3();
    rig.bones.head.getWorldPosition(headWorld);
    const pivot = ANIMAL_MODELS.WOLF.bones.head.pivot.map((v) => v * ANIMAL_MODELS.WOLF.unit);
    expect(headWorld.toArray().map((v) => +v.toFixed(5))).toEqual(pivot.map((v) => +v.toFixed(5)));
    expect(rig.rest.body.y).toBeCloseTo(13 * ANIMAL_MODELS.WOLF.unit);
    rig.dispose();
  });

  test('instances share geometry but not skeletons', () => {
    const a = createAnimalInstance('DEER', { variant: 'antlers' });
    const b = createAnimalInstance('DEER', { variant: 'antlers' });
    const doe = createAnimalInstance('DEER');
    expect(a.mesh.geometry).toBe(b.mesh.geometry);
    expect(a.mesh.skeleton).not.toBe(b.mesh.skeleton);
    expect(doe.mesh.geometry).not.toBe(a.mesh.geometry);
  });

  test('unknown types give null', () => {
    expect(createAnimalInstance('DRAGON')).toBeNull();
  });
});

describe('getAnimalTraits', () => {
  test('is stable per id and varies between animals', () => {
    expect(getAnimalTraits('wildlife_1', 'DEER')).toEqual(getAnimalTraits('wildlife_1', 'DEER'));
    const all = Array.from({ length: 40 }, (_, i) => getAnimalTraits(`wildlife_${i}`, 'DEER'));
    for (const t of all) {
      expect(t.scale).toBeGreaterThanOrEqual(0.9);
      expect(t.scale).toBeLessThanOrEqual(1.1);
    }
    const variants = new Set(all.map((t) => t.variant));
    expect(variants).toEqual(new Set(['antlers', null]));
    expect(getAnimalTraits('wildlife_1', 'WOLF').variant).toBeNull();
  });
});
