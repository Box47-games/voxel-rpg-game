/**
 * portraits.client.js — Runs in the browser (loaded by portraits.mjs through
 * Vite): renders the real player and settler models to transparent PNGs.
 */
import * as THREE from 'three';
import { createHumanoidInstance, PLAYER_LOOK, getSettlerLook, SETTLER_UNIT } from '/src/components/3d/characters/humanoidModel.js';
import { generateNPCIdentity } from '/src/data/npcIdentity.js';

function snap(rig, { w, h, yaw = 0.45, head = false, scale = 2 }) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(scale);
  renderer.setSize(w, h);
  renderer.setClearColor(0, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xfff4e0, 0x5a4a3a, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(2, 4, 3);
  scene.add(sun);
  const holder = new THREE.Group();
  holder.add(rig.mesh);
  holder.rotation.y = yaw;
  scene.add(holder);
  holder.updateMatrixWorld(true);
  rig.mesh.skeleton.update();
  const box = new THREE.Box3().setFromObject(rig.mesh, true);
  const size = box.getSize(new THREE.Vector3());
  const c = box.getCenter(new THREE.Vector3());
  const viewH = head ? size.y * 0.42 : size.y * 1.08;
  const cy = head ? box.max.y - viewH * 0.52 : c.y;
  const a = w / h;
  const cam = new THREE.OrthographicCamera((-viewH * a) / 2, (viewH * a) / 2, viewH / 2, -viewH / 2, 0.01, 50);
  cam.position.set(c.x, cy + 0.6, c.z + 6);
  cam.lookAt(c.x, cy, c.z);
  renderer.render(scene, cam);
  const url = renderer.domElement.toDataURL('image/png');
  renderer.dispose();
  return url;
}

export function renderPortraits() {
  const out = { player: snap(createHumanoidInstance(PLAYER_LOOK), { w: 240, h: 330 }) };
  for (const job of ['gatherer', 'miner', 'builder', 'guard', 'farmer']) {
    for (let seed = 1; seed < 500; seed++) {
      const id = generateNPCIdentity(seed);
      if (id.preferredJob !== job) continue;
      const look = getSettlerLook({ id: `npc_${seed}`, ...id });
      out[`settler-${job}`] = snap(createHumanoidInstance(look, { unit: SETTLER_UNIT }), { w: 128, h: 128, head: true, yaw: 0.3 });
      break;
    }
  }
  return out;
}
